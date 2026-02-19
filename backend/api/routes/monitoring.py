"""
Monitoring module endpoints: strategy name mapping, ingest, accounts, snapshots.
"""
import hashlib
import logging
from datetime import date, datetime, timezone
from typing import List, Optional
from uuid import UUID
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import and_, desc, func

from backend.database.connection import get_db
from backend.api.models.database import (
    Strategy,
    StrategyPosition,
    ProductEquivalent,
    StrategyNameMapping,
    DiscoveryModel,
    MonitoredAccount,
    AccountSnapshot,
    AccountSnapshotHolding,
    MonitoringIngestRun,
)
from backend.api.models.schemas import (
    StrategyNameMappingCreate,
    StrategyNameMappingResponse,
    MonitoredAccountResponse,
    MonitoredAccountUpdate,
    MonitoredAccountListItem,
    AccountSnapshotResponse,
    AccountSnapshotHoldingResponse,
    IngestResponse,
    LastIngestResponse,
    RecalculateResponse,
    SnapshotWithBreakdown,
    AssetClassAllocation,
    ConcentrationReportItem,
    ConcentrationAccountItem,
    TopOffenderItem,
    UnmappedTickerItem,
    AdviserAccountDetailItem,
    LegacyTickerTotalItem,
    AdviserAccountDetailsResponse,
    DiscoveryModelSummaryItem,
    DiscoveryResponse,
    DiscoveryMapRequest,
    DiscoveryModelResponse,
    AdvisorTotalItem,
    TotalFirmResponse,
    TotalFirmModelSummaryItem,
    TotalFirmAccountItem,
)
from backend.utils.csv_parser import parse_aggregated_holdings_csv
from backend.logic.monitor_engine import (
    compute_rollup_and_scores,
    get_allocations_breakdown,
)

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/discovery", response_model=DiscoveryResponse)
async def get_discovery(
    as_of_date: Optional[date] = None,
    db: Session = Depends(get_db),
):
    """Returns aggregated summary of all models (mapped and unmapped) from latest data, including total assets per advisor."""
    snapshot_date = as_of_date or _get_latest_snapshot_date(db)
    if not snapshot_date:
        return DiscoveryResponse(models=[], total_assets_by_advisor=[])

    snapshots = (
        db.query(AccountSnapshot, MonitoredAccount)
        .join(MonitoredAccount, AccountSnapshot.monitored_account_id == MonitoredAccount.id)
        .filter(
            AccountSnapshot.as_of_date == snapshot_date,
            MonitoredAccount.external_model_name.isnot(None),
            MonitoredAccount.external_model_name != "",
        )
        .all()
    )
    discovery_by_name = {
        dm.external_model_name.strip().lower(): dm
        for dm in db.query(DiscoveryModel).filter(DiscoveryModel.is_active.is_(True)).all()
    }
    agg: dict = {}  # (advisor, external_model_name) -> (total_assets, account_count, firm)
    for snap, acc in snapshots:
        advisor = (acc.advisor or "").strip() or ""
        ext = (acc.external_model_name or "").strip()
        if not ext:
            continue
        key = (advisor, ext)
        if key not in agg:
            agg[key] = [Decimal("0"), 0, (acc.firm or "").strip()]
        agg[key][0] += snap.total_value
        agg[key][1] += 1
    models_list = []
    for (advisor, external_model_name), (total_assets, account_count, firm) in agg.items():
        dm = discovery_by_name.get(external_model_name.lower())
        internal_strategy_id = dm.internal_strategy_id if dm else None
        is_mapped = internal_strategy_id is not None
        models_list.append(
            DiscoveryModelSummaryItem(
                advisor=advisor,
                external_model_name=external_model_name,
                firm=firm or None,
                total_assets=total_assets,
                account_count=account_count,
                internal_strategy_id=internal_strategy_id,
                is_mapped=is_mapped,
            )
        )
    models_list.sort(key=lambda x: (-float(x.total_assets), x.advisor, x.external_model_name))

    advisor_totals: dict = {}
    for item in models_list:
        advisor_totals[item.advisor] = advisor_totals.get(item.advisor, Decimal("0")) + item.total_assets
    total_assets_by_advisor = [
        AdvisorTotalItem(advisor=a, total_assets=advisor_totals[a])
        for a in sorted(advisor_totals.keys())
    ]
    total_assets_by_advisor.sort(key=lambda x: -float(x.total_assets))

    return DiscoveryResponse(models=models_list, total_assets_by_advisor=total_assets_by_advisor)


@router.post("/discovery/map", response_model=DiscoveryModelResponse)
async def map_discovery_model(
    body: DiscoveryMapRequest,
    db: Session = Depends(get_db),
):
    """Create or update the mapping of an external model name to an internal strategy."""
    strategy = db.query(Strategy).filter(Strategy.id == body.internal_strategy_id).first()
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")
    name_clean = body.external_model_name.strip()
    dm = db.query(DiscoveryModel).filter(
        func.lower(DiscoveryModel.external_model_name) == name_clean.lower()
    ).first()
    now_utc = datetime.now(timezone.utc)
    if dm:
        dm.internal_strategy_id = body.internal_strategy_id
        dm.last_seen = now_utc
        dm.is_active = True
    else:
        dm = DiscoveryModel(
            external_model_name=name_clean,
            internal_strategy_id=body.internal_strategy_id,
            last_seen=now_utc,
            is_active=True,
        )
        db.add(dm)
    db.flush()
    # Keep StrategyNameMapping in sync for backward compatibility
    existing_mapping = db.query(StrategyNameMapping).filter(
        func.lower(StrategyNameMapping.external_model_name) == name_clean.lower()
    ).first()
    if existing_mapping:
        existing_mapping.internal_strategy_id = body.internal_strategy_id
    else:
        db.add(StrategyNameMapping(
            external_model_name=name_clean,
            internal_strategy_id=body.internal_strategy_id,
        ))
    db.commit()
    db.refresh(dm)
    return DiscoveryModelResponse.model_validate(dm)


@router.get("/strategy-mappings", response_model=List[StrategyNameMappingResponse])
async def list_strategy_mappings(db: Session = Depends(get_db)):
    """List all external model name -> internal strategy mappings."""
    mappings = db.query(StrategyNameMapping).all()
    return [StrategyNameMappingResponse.model_validate(m) for m in mappings]


@router.post("/strategy-mappings", response_model=StrategyNameMappingResponse)
async def create_strategy_mapping(
    body: StrategyNameMappingCreate,
    db: Session = Depends(get_db),
):
    """Create a strategy name mapping."""
    strategy = db.query(Strategy).filter(Strategy.id == body.internal_strategy_id).first()
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")
    existing = db.query(StrategyNameMapping).filter(
        StrategyNameMapping.external_model_name == body.external_model_name.strip()
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Mapping for this external name already exists")
    mapping = StrategyNameMapping(
        external_model_name=body.external_model_name.strip(),
        internal_strategy_id=body.internal_strategy_id,
    )
    db.add(mapping)
    db.commit()
    db.refresh(mapping)
    return StrategyNameMappingResponse.model_validate(mapping)


@router.put("/strategy-mappings/{mapping_id}", response_model=StrategyNameMappingResponse)
async def update_strategy_mapping(
    mapping_id: UUID,
    body: StrategyNameMappingCreate,
    db: Session = Depends(get_db),
):
    """Update a strategy name mapping."""
    mapping = db.query(StrategyNameMapping).filter(StrategyNameMapping.id == mapping_id).first()
    if not mapping:
        raise HTTPException(status_code=404, detail="Mapping not found")
    strategy = db.query(Strategy).filter(Strategy.id == body.internal_strategy_id).first()
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")
    mapping.external_model_name = body.external_model_name.strip()
    mapping.internal_strategy_id = body.internal_strategy_id
    db.commit()
    db.refresh(mapping)
    return StrategyNameMappingResponse.model_validate(mapping)


@router.delete("/strategy-mappings/{mapping_id}")
async def delete_strategy_mapping(
    mapping_id: UUID,
    db: Session = Depends(get_db),
):
    """Delete a strategy name mapping."""
    mapping = db.query(StrategyNameMapping).filter(StrategyNameMapping.id == mapping_id).first()
    if not mapping:
        raise HTTPException(status_code=404, detail="Mapping not found")
    db.delete(mapping)
    db.commit()
    return {"message": "Mapping deleted"}


def _file_checksum(csv_content: str) -> str:
    """SHA256 hash of normalized content to detect duplicate file ingest."""
    return hashlib.sha256(csv_content.encode("utf-8")).hexdigest()


@router.post("/ingest", response_model=IngestResponse)
async def ingest_aggregated_holdings(
    request: Request,
    db: Session = Depends(get_db),
    force: bool = Query(False, description="If true, run full ingest even when file checksum matches last ingest (recalculate Heat map, Concentration, By Adviser)."),
):
    """Ingest aggregated holdings CSV. Saves accounts and snapshots; heat map is computed when a new file is ingested or when force=true (duplicate file otherwise skipped)."""
    body = await request.body()
    csv_content = body.decode("utf-8-sig").strip()
    file_checksum = _file_checksum(csv_content)

    # Skip processing if the same file was already ingested, unless force=true
    latest_run = (
        db.query(MonitoringIngestRun)
        .order_by(desc(MonitoringIngestRun.ingested_at))
        .first()
    )
    if not force and latest_run and latest_run.file_checksum == file_checksum:
        logger.info("Monitoring ingest: same file already ingested (checksum %s), skipping", file_checksum[:16])
        return IngestResponse(
            ingested_count=0,
            skipped_count=0,
            data_inconsistency_synthetic_ids=[],
            as_of_date=latest_run.as_of_date,
            last_ingest_at=latest_run.ingested_at,
            duplicate_file_skipped=True,
        )

    try:
        groups = parse_aggregated_holdings_csv(csv_content)
    except Exception as e:
        logger.warning("Aggregated CSV parse error: %s", e)
        raise HTTPException(status_code=400, detail=str(e))

    # Upsert DiscoveryModel for every unique external_model_name (bridge table)
    now_utc = datetime.now(timezone.utc)
    strategy_mapping_by_name = {
        m.external_model_name.strip().lower(): m.internal_strategy_id
        for m in db.query(StrategyNameMapping).all()
    }
    seen_models: set = set()
    for g in groups:
        if g.get("data_inconsistency"):
            continue
        external = (g.get("external_model_name") or "").strip()
        if not external or external.lower() in seen_models:
            continue
        seen_models.add(external.lower())
        dm = db.query(DiscoveryModel).filter(
            func.lower(DiscoveryModel.external_model_name) == external.lower()
        ).first()
        if dm:
            dm.last_seen = now_utc
            dm.is_active = True
        else:
            internal_id = strategy_mapping_by_name.get(external.lower())
            dm = DiscoveryModel(
                external_model_name=external,
                internal_strategy_id=internal_id,
                last_seen=now_utc,
                is_active=True,
            )
            db.add(dm)
    db.flush()

    # Mapping: DiscoveryModel first (internal_strategy_id not null), then StrategyNameMapping
    discovery_by_name = {
        dm.external_model_name.strip().lower(): dm
        for dm in db.query(DiscoveryModel).filter(DiscoveryModel.is_active.is_(True)).all()
    }
    mapping_by_name = {}
    for key, dm in discovery_by_name.items():
        if dm.internal_strategy_id is not None:
            mapping_by_name[key] = dm.internal_strategy_id
    for name_lower, sid in strategy_mapping_by_name.items():
        if name_lower not in mapping_by_name:
            mapping_by_name[name_lower] = sid

    ingested_count = 0
    skipped_count = 0
    data_inconsistency_synthetic_ids: List[str] = []
    as_of_date_used: Optional[date] = None

    for g in groups:
        if g.get("data_inconsistency"):
            data_inconsistency_synthetic_ids.append(g["synthetic_id"])
            continue
        external = (g.get("external_model_name") or "").strip()
        key = external.lower()
        internal_strategy_id = mapping_by_name.get(key)
        as_of_date_used = g.get("as_of_date") or date.today()

        firm = (g.get("firm") or "").strip() or None
        advisor = (g.get("advisor") or "").strip() or None
        account_display = (g.get("account_display") or "").strip() or None

        account = db.query(MonitoredAccount).filter(
            MonitoredAccount.synthetic_id == g["synthetic_id"]
        ).first()
        if not account:
            account = MonitoredAccount(
                synthetic_id=g["synthetic_id"],
                friendly_name=None,
                internal_strategy_id=internal_strategy_id,
                external_model_name=external or None,
                firm=firm,
                advisor=advisor,
                account_display=account_display,
            )
            db.add(account)
            db.flush()
        else:
            account.internal_strategy_id = internal_strategy_id
            account.external_model_name = external or None
            account.firm = firm
            account.advisor = advisor
            account.account_display = account_display

        if internal_strategy_id is not None:
            # Mapped: full snapshot with rollup and holdings
            positions = db.query(StrategyPosition).filter(
                StrategyPosition.strategy_id == internal_strategy_id
            ).all()
            positions_data = [
                {
                    "model_ticker": p.model_ticker,
                    "asset_class": p.asset_class.value if hasattr(p.asset_class, "value") else str(p.asset_class),
                    "target_allocation": float(p.target_allocation),
                }
                for p in positions
            ]
            product_equivalents = db.query(ProductEquivalent).filter(
                ProductEquivalent.strategy_id == internal_strategy_id
            ).all()
            pe_data = [
                {"legacy_ticker": pe.legacy_ticker, "model_ticker": pe.model_ticker, "grade": pe.grade}
                for pe in product_equivalents
            ]

            actual_by_ac, deviation_score, purity_score, holdings_with_meta = compute_rollup_and_scores(
                holdings=g.get("holdings") or [],
                cash_value=Decimal(str(g.get("cash_value", 0))),
                positions=positions_data,
                product_equivalents=pe_data,
            )
            total_val = Decimal(str(g["total_value"]))
            cash_pct = round(Decimal(str(g.get("cash_value", 0))) / total_val * Decimal("100"), 2) if total_val else None

            snapshot = db.query(AccountSnapshot).filter(
                AccountSnapshot.monitored_account_id == account.id,
                AccountSnapshot.as_of_date == as_of_date_used,
            ).first()
            if snapshot:
                db.query(AccountSnapshotHolding).filter(
                    AccountSnapshotHolding.account_snapshot_id == snapshot.id
                ).delete()
                snapshot.total_value = g["total_value"]
                snapshot.total_deviation_score = deviation_score
                snapshot.purity_score = purity_score
                snapshot.cash_pct = cash_pct
                snapshot.is_unmapped = False
            else:
                snapshot = AccountSnapshot(
                    monitored_account_id=account.id,
                    as_of_date=as_of_date_used,
                    total_value=g["total_value"],
                    total_deviation_score=deviation_score,
                    purity_score=purity_score,
                    cash_pct=cash_pct,
                    is_unmapped=False,
                )
                db.add(snapshot)
                db.flush()

            for h in holdings_with_meta:
                db.add(AccountSnapshotHolding(
                    account_snapshot_id=snapshot.id,
                    ticker=h.get("ticker", ""),
                    asset_class=h.get("asset_class"),
                    value=Decimal(str(h.get("value", 0))),
                    weight_pct=Decimal(str(h.get("weight_pct", 0))) if h.get("weight_pct") is not None else None,
                    grade=h.get("grade"),
                ))
        else:
            # Unmapped: save account and snapshot with value only, flag as Unmapped
            snapshot = db.query(AccountSnapshot).filter(
                AccountSnapshot.monitored_account_id == account.id,
                AccountSnapshot.as_of_date == as_of_date_used,
            ).first()
            if snapshot:
                db.query(AccountSnapshotHolding).filter(
                    AccountSnapshotHolding.account_snapshot_id == snapshot.id
                ).delete()
                snapshot.total_value = g["total_value"]
                snapshot.total_deviation_score = Decimal("0")
                snapshot.purity_score = Decimal("0")
                snapshot.cash_pct = None
                snapshot.is_unmapped = True
            else:
                snapshot = AccountSnapshot(
                    monitored_account_id=account.id,
                    as_of_date=as_of_date_used,
                    total_value=g["total_value"],
                    total_deviation_score=Decimal("0"),
                    purity_score=Decimal("0"),
                    cash_pct=None,
                    is_unmapped=True,
                )
                db.add(snapshot)
                db.flush()
        ingested_count += 1

    # Record this ingest run so we know when heat map data was last updated
    ingest_run = MonitoringIngestRun(
        ingested_count=ingested_count,
        as_of_date=as_of_date_used,
        file_checksum=file_checksum,
    )
    db.add(ingest_run)
    db.commit()
    db.refresh(ingest_run)
    logger.info(
        "Monitoring ingest: ingested=%s skipped=%s data_inconsistency=%s",
        ingested_count, skipped_count, len(data_inconsistency_synthetic_ids),
    )
    return IngestResponse(
        ingested_count=ingested_count,
        skipped_count=skipped_count,
        data_inconsistency_synthetic_ids=data_inconsistency_synthetic_ids,
        as_of_date=as_of_date_used,
        last_ingest_at=ingest_run.ingested_at,
        duplicate_file_skipped=False,
    )


RECALCULATE_CHECKSUM = "RECALCULATE"


@router.post("/recalculate", response_model=RecalculateResponse)
async def recalculate_monitoring(
    strategy_id: Optional[UUID] = Query(None, description="If set, only recalculate snapshots for accounts with this strategy."),
    db: Session = Depends(get_db),
):
    """Recompute deviation scores, purity scores, and holdings metadata for all mapped snapshots using current strategy positions and product equivalents. Call after Product Equivalents or Bulk Upload (strategy positions) changes."""
    snapshots = (
        db.query(AccountSnapshot)
        .join(MonitoredAccount, AccountSnapshot.monitored_account_id == MonitoredAccount.id)
        .filter(AccountSnapshot.is_unmapped.is_(False))
        .filter(MonitoredAccount.internal_strategy_id.isnot(None))
    )
    if strategy_id is not None:
        snapshots = snapshots.filter(MonitoredAccount.internal_strategy_id == strategy_id)
    snapshots = snapshots.all()

    if not snapshots:
        return RecalculateResponse(recalculated_count=0, last_ingest_at=None)

    snapshot_ids = [s.id for s in snapshots]
    account_ids = [s.monitored_account_id for s in snapshots]
    accounts = db.query(MonitoredAccount).filter(MonitoredAccount.id.in_(account_ids)).all()
    account_by_id = {a.id: a for a in accounts}

    holdings_all = (
        db.query(AccountSnapshotHolding)
        .filter(AccountSnapshotHolding.account_snapshot_id.in_(snapshot_ids))
        .all()
    )
    holdings_by_snapshot: dict = {}
    for h in holdings_all:
        sid = h.account_snapshot_id
        if sid not in holdings_by_snapshot:
            holdings_by_snapshot[sid] = []
        holdings_by_snapshot[sid].append(h)

    strategy_ids = list({a.internal_strategy_id for a in accounts if a.internal_strategy_id})
    positions_by_strategy: dict = {}
    pe_by_strategy: dict = {}
    for sid in strategy_ids:
        positions = db.query(StrategyPosition).filter(StrategyPosition.strategy_id == sid).all()
        positions_data = [
            {
                "model_ticker": p.model_ticker,
                "asset_class": p.asset_class.value if hasattr(p.asset_class, "value") else str(p.asset_class),
                "target_allocation": float(p.target_allocation),
            }
            for p in positions
        ]
        positions_by_strategy[sid] = positions_data
        pe_list = db.query(ProductEquivalent).filter(ProductEquivalent.strategy_id == sid).all()
        pe_by_strategy[sid] = [
            {"legacy_ticker": pe.legacy_ticker, "model_ticker": pe.model_ticker, "grade": pe.grade}
            for pe in pe_list
        ]

    recalculated_count = 0
    for snap in snapshots:
        acc = account_by_id.get(snap.monitored_account_id)
        if not acc or not acc.internal_strategy_id:
            continue
        positions_data = positions_by_strategy.get(acc.internal_strategy_id, [])
        pe_data = pe_by_strategy.get(acc.internal_strategy_id, [])

        holdings_raw = holdings_by_snapshot.get(snap.id, [])
        non_cash = []
        cash_value = Decimal("0")
        for h in holdings_raw:
            ticker = (h.ticker or "").strip().upper()
            val = Decimal(str(h.value))
            if ticker == "CASH":
                cash_value += val
            else:
                non_cash.append({"ticker": h.ticker, "value": h.value})

        actual_by_ac, deviation_score, purity_score, holdings_with_meta = compute_rollup_and_scores(
            holdings=non_cash,
            cash_value=cash_value,
            positions=positions_data,
            product_equivalents=pe_data,
        )
        total_val = snap.total_value
        cash_pct = round(cash_value / total_val * Decimal("100"), 2) if total_val else None

        db.query(AccountSnapshotHolding).filter(
            AccountSnapshotHolding.account_snapshot_id == snap.id
        ).delete()
        snap.total_deviation_score = deviation_score
        snap.purity_score = purity_score
        snap.cash_pct = cash_pct
        for h in holdings_with_meta:
            db.add(AccountSnapshotHolding(
                account_snapshot_id=snap.id,
                ticker=h.get("ticker", ""),
                asset_class=h.get("asset_class"),
                value=Decimal(str(h.get("value", 0))),
                weight_pct=Decimal(str(h.get("weight_pct", 0))) if h.get("weight_pct") is not None else None,
                grade=h.get("grade"),
            ))
        recalculated_count += 1

    ingest_run = MonitoringIngestRun(
        ingested_count=recalculated_count,
        as_of_date=snapshots[0].as_of_date if snapshots else None,
        file_checksum=RECALCULATE_CHECKSUM,
    )
    db.add(ingest_run)
    db.commit()
    db.refresh(ingest_run)
    logger.info("Monitoring recalculate: %s snapshots updated", recalculated_count)
    return RecalculateResponse(
        recalculated_count=recalculated_count,
        last_ingest_at=ingest_run.ingested_at,
    )


@router.get("/last-ingest", response_model=LastIngestResponse)
async def get_last_ingest(db: Session = Depends(get_db)):
    """Return when heat map data was last updated (from most recent ingest run)."""
    latest = (
        db.query(MonitoringIngestRun)
        .order_by(desc(MonitoringIngestRun.ingested_at))
        .first()
    )
    if not latest:
        return LastIngestResponse(last_ingest_at=None, as_of_date=None)
    return LastIngestResponse(last_ingest_at=latest.ingested_at, as_of_date=latest.as_of_date)


@router.get("/accounts", response_model=List[MonitoredAccountListItem])
async def list_monitored_accounts(
    as_of_date: Optional[date] = None,
    mapped_only: bool = Query(False, description="If true, return only accounts with a mapped strategy (for Heat Map)."),
    db: Session = Depends(get_db),
):
    """List monitored accounts with latest (or given as_of_date) snapshot. Use mapped_only=true for Heat Map (mapped strategy only)."""
    q = db.query(MonitoredAccount)
    if mapped_only:
        q = q.filter(MonitoredAccount.internal_strategy_id.isnot(None))
    accounts = q.all()
    if not accounts:
        return []

    account_ids = [a.id for a in accounts]
    strategy_ids = [a.internal_strategy_id for a in accounts if a.internal_strategy_id is not None]

    if as_of_date is not None:
        snapshots = (
            db.query(AccountSnapshot)
            .filter(
                AccountSnapshot.monitored_account_id.in_(account_ids),
                AccountSnapshot.as_of_date == as_of_date,
            )
            .all()
        )
    else:
        subq = (
            db.query(
                AccountSnapshot.monitored_account_id,
                func.max(AccountSnapshot.as_of_date).label("max_date"),
            )
            .group_by(AccountSnapshot.monitored_account_id)
            .subquery()
        )
        snapshots = (
            db.query(AccountSnapshot)
            .join(
                subq,
                and_(
                    AccountSnapshot.monitored_account_id == subq.c.monitored_account_id,
                    AccountSnapshot.as_of_date == subq.c.max_date,
                ),
            )
            .filter(AccountSnapshot.monitored_account_id.in_(account_ids))
            .all()
        )

    snapshot_by_account = {s.monitored_account_id: s for s in snapshots}

    strategy_by_id = {}
    if strategy_ids:
        strategies = db.query(Strategy).filter(Strategy.id.in_(strategy_ids)).all()
        strategy_by_id = {s.id: s for s in strategies}

    result = []
    for acc in accounts:
        snapshot = snapshot_by_account.get(acc.id)
        strategy = strategy_by_id.get(acc.internal_strategy_id) if acc.internal_strategy_id else None
        result.append(MonitoredAccountListItem(
            id=acc.id,
            synthetic_id=acc.synthetic_id,
            friendly_name=acc.friendly_name,
            strategy_name=strategy.name if strategy else None,
            internal_strategy_id=acc.internal_strategy_id,
            firm=acc.firm,
            advisor=acc.advisor,
            account_display=acc.account_display,
            total_value=snapshot.total_value if snapshot else None,
            total_deviation_score=snapshot.total_deviation_score if snapshot else None,
            purity_score=snapshot.purity_score if snapshot else None,
            cash_pct=snapshot.cash_pct if snapshot else None,
            as_of_date=snapshot.as_of_date if snapshot else None,
        ))
    return result


@router.get("/total-firm", response_model=TotalFirmResponse)
async def get_total_firm(
    as_of_date: Optional[date] = None,
    db: Session = Depends(get_db),
):
    """All ingested accounts with summary by model (total value). For Total Firm subtab: summary at top, then table of accounts with Advisor, partial account number, Model, value, has_equivalents, view link."""
    snapshot_date = as_of_date or _get_latest_snapshot_date(db)
    if not snapshot_date:
        return TotalFirmResponse(summary_by_model=[], accounts=[])

    accounts = db.query(MonitoredAccount).all()
    snapshots = (
        db.query(AccountSnapshot)
        .filter(
            AccountSnapshot.monitored_account_id.in_([a.id for a in accounts]),
            AccountSnapshot.as_of_date == snapshot_date,
        )
        .all()
    )
    snapshot_by_account = {s.monitored_account_id: s for s in snapshots}

    # For each snapshot, check if any holding has grade 1 or 2 (has_equivalents)
    snapshot_ids = [s.id for s in snapshots]
    holdings_with_grade = (
        db.query(AccountSnapshotHolding.account_snapshot_id)
        .filter(
            AccountSnapshotHolding.account_snapshot_id.in_(snapshot_ids),
            AccountSnapshotHolding.grade.in_([1, 2]),
            AccountSnapshotHolding.ticker != "CASH",
        )
        .distinct()
        .all()
    )
    snapshots_with_equivalents = {h[0] for h in holdings_with_grade}

    summary_by_model: dict = {}  # model_name -> (total_value, account_count)
    account_items: List[TotalFirmAccountItem] = []

    for acc in accounts:
        snap = snapshot_by_account.get(acc.id)
        if not snap:
            continue
        model_name = (acc.external_model_name or "").strip() or None
        total_value = snap.total_value
        has_equivalents = snap.id in snapshots_with_equivalents
        partial = (acc.account_display or (acc.synthetic_id[:8] + "…") if acc.synthetic_id else "") or None
        account_items.append(
            TotalFirmAccountItem(
                id=acc.id,
                advisor=acc.advisor,
                partial_account_number=partial,
                model_name=model_name,
                total_value=total_value,
                has_equivalents=has_equivalents,
            )
        )
        if model_name:
            if model_name not in summary_by_model:
                summary_by_model[model_name] = [Decimal("0"), 0]
            summary_by_model[model_name][0] += total_value
            summary_by_model[model_name][1] += 1

    summary_list = [
        TotalFirmModelSummaryItem(
            model_name=name,
            total_value=total_value_count[0],
            account_count=total_value_count[1],
        )
        for name, total_value_count in sorted(summary_by_model.items(), key=lambda x: -float(x[1][0]))
    ]
    account_items.sort(key=lambda x: (-float(x.total_value), x.advisor or "", x.partial_account_number or ""))

    return TotalFirmResponse(summary_by_model=summary_list, accounts=account_items)


@router.get("/accounts/{account_id}", response_model=MonitoredAccountResponse)
async def get_monitored_account(
    account_id: UUID,
    db: Session = Depends(get_db),
):
    """Get monitored account by id."""
    account = db.query(MonitoredAccount).filter(MonitoredAccount.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return MonitoredAccountResponse.model_validate(account)


@router.patch("/accounts/{account_id}", response_model=MonitoredAccountResponse)
async def update_monitored_account(
    account_id: UUID,
    body: MonitoredAccountUpdate,
    db: Session = Depends(get_db),
):
    """Update friendly_name for a monitored account."""
    account = db.query(MonitoredAccount).filter(MonitoredAccount.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    if body.friendly_name is not None:
        account.friendly_name = body.friendly_name.strip() or None
    db.commit()
    db.refresh(account)
    return MonitoredAccountResponse.model_validate(account)


def _build_target_by_ac(strategy_id: UUID, db: Session):
    positions = db.query(StrategyPosition).filter(StrategyPosition.strategy_id == strategy_id).all()
    target_by_ac = {}
    for p in positions:
        ac = p.asset_class.value if hasattr(p.asset_class, "value") else str(p.asset_class)
        target_by_ac[ac] = Decimal(str(p.target_allocation))
    return target_by_ac


@router.get("/accounts/{account_id}/snapshots", response_model=List[SnapshotWithBreakdown])
async def get_account_snapshots(
    account_id: UUID,
    as_of_date: Optional[date] = None,
    db: Session = Depends(get_db),
):
    """Get snapshots for an account, optionally for a specific as_of_date. Includes actual vs target breakdown."""
    account = db.query(MonitoredAccount).filter(MonitoredAccount.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    q = db.query(AccountSnapshot).filter(AccountSnapshot.monitored_account_id == account_id)
    if as_of_date is not None:
        q = q.filter(AccountSnapshot.as_of_date == as_of_date)
    snapshots = q.order_by(AccountSnapshot.as_of_date.desc()).all()

    if account.internal_strategy_id is not None:
        positions_data = [
            {"model_ticker": p.model_ticker, "asset_class": p.asset_class.value, "target_allocation": float(p.target_allocation)}
            for p in db.query(StrategyPosition).filter(StrategyPosition.strategy_id == account.internal_strategy_id).all()
        ]
        pe_data = [
            {"legacy_ticker": pe.legacy_ticker, "model_ticker": pe.model_ticker, "grade": pe.grade}
            for pe in db.query(ProductEquivalent).filter(ProductEquivalent.strategy_id == account.internal_strategy_id).all()
        ]
        target_by_ac = _build_target_by_ac(account.internal_strategy_id, db)
    else:
        positions_data = []
        pe_data = []
        target_by_ac = {}

    result = []
    for snap in snapshots:
        if getattr(snap, "is_unmapped", False):
            allocations = []
        else:
            holdings = [
                {"ticker": h.ticker, "value": h.value}
                for h in db.query(AccountSnapshotHolding).filter(
                    AccountSnapshotHolding.account_snapshot_id == snap.id
                ).all()
            ]
            cash_val = Decimal("0")
            non_cash = []
            for h in holdings:
                if (h.get("ticker") or "").strip().upper() == "CASH":
                    cash_val += Decimal(str(h.get("value", 0)))
                else:
                    non_cash.append(h)
            actual_by_ac, _, _, _ = compute_rollup_and_scores(
                holdings=non_cash,
                cash_value=cash_val,
                positions=positions_data,
                product_equivalents=pe_data,
            )
            allocations = get_allocations_breakdown(actual_by_ac, target_by_ac)

        snap_holdings = [
            AccountSnapshotHoldingResponse(
                id=h.id,
                account_snapshot_id=h.account_snapshot_id,
                ticker=h.ticker,
                asset_class=h.asset_class,
                value=h.value,
                weight_pct=h.weight_pct,
                grade=h.grade,
            )
            for h in db.query(AccountSnapshotHolding).filter(
                AccountSnapshotHolding.account_snapshot_id == snap.id
            ).all()
        ]
        snap_resp = AccountSnapshotResponse(
            id=snap.id,
            monitored_account_id=snap.monitored_account_id,
            as_of_date=snap.as_of_date,
            total_value=snap.total_value,
            total_deviation_score=snap.total_deviation_score,
            purity_score=snap.purity_score,
            created_at=snap.created_at,
            holdings=snap_holdings,
        )
        result.append(SnapshotWithBreakdown(
            snapshot=snap_resp,
            allocations=[
                AssetClassAllocation(
                    asset_class=a["asset_class"],
                    actual_pct=a["actual_pct"],
                    target_pct=a["target_pct"],
                    drift_pct=a["drift_pct"],
                )
                for a in allocations
            ],
        ))
    return result


def _get_latest_snapshot_date(db: Session) -> Optional[date]:
    """Return the latest as_of_date across all snapshots, or None."""
    row = db.query(func.max(AccountSnapshot.as_of_date)).first()
    return row[0] if row and row[0] else None


@router.get("/concentration-report", response_model=List[ConcentrationReportItem])
async def get_concentration_report(
    as_of_date: Optional[date] = None,
    db: Session = Depends(get_db),
):
    """List every Grade 1 and Grade 2 ticker in the latest (or given) snapshot with total $ held across all advisors."""
    snapshot_date = as_of_date or _get_latest_snapshot_date(db)
    if not snapshot_date:
        return []
    snapshots = db.query(AccountSnapshot).filter(AccountSnapshot.as_of_date == snapshot_date).all()
    snapshot_ids = [s.id for s in snapshots]
    holdings = (
        db.query(AccountSnapshotHolding, AccountSnapshot.monitored_account_id)
        .join(AccountSnapshot, AccountSnapshotHolding.account_snapshot_id == AccountSnapshot.id)
        .filter(
            AccountSnapshotHolding.account_snapshot_id.in_(snapshot_ids),
            AccountSnapshotHolding.grade.in_([1, 2]),
            AccountSnapshotHolding.ticker != "CASH",
        )
        .all()
    )
    agg: dict = {}  # (ticker, grade) -> (total_value, set of account_ids)
    asset_class_by_key: dict = {}  # (ticker, grade) -> asset_class
    for h, acc_id in holdings:
        key = (h.ticker.strip(), h.grade)
        if key not in agg:
            agg[key] = [Decimal("0"), set()]
        agg[key][0] += h.value
        agg[key][1].add(acc_id)
        if key not in asset_class_by_key:
            asset_class_by_key[key] = h.asset_class
    result = []
    for (ticker, grade), (total_value, account_ids) in agg.items():
        ac = asset_class_by_key.get((ticker, grade))
        result.append(
            ConcentrationReportItem(
                ticker=ticker,
                grade=grade,
                total_value=total_value,
                account_count=len(account_ids),
                asset_class=ac,
            )
        )
    result.sort(key=lambda x: (-float(x.total_value), x.ticker))
    return result


@router.get("/concentration-report/{ticker}/accounts", response_model=List[ConcentrationAccountItem])
async def get_concentration_ticker_accounts(
    ticker: str,
    grade: int,
    as_of_date: Optional[date] = None,
    db: Session = Depends(get_db),
):
    """List accounts holding a given ticker at the given grade (1 or 2) with value and pct of total."""
    if grade not in (1, 2):
        raise HTTPException(status_code=400, detail="grade must be 1 or 2")
    snapshot_date = as_of_date or _get_latest_snapshot_date(db)
    if not snapshot_date:
        return []
    snapshots = db.query(AccountSnapshot).filter(AccountSnapshot.as_of_date == snapshot_date).all()
    snapshot_ids = [s.id for s in snapshots]
    ticker_clean = (ticker or "").strip()
    holdings = (
        db.query(AccountSnapshotHolding, AccountSnapshot.monitored_account_id)
        .join(AccountSnapshot, AccountSnapshotHolding.account_snapshot_id == AccountSnapshot.id)
        .filter(
            AccountSnapshotHolding.account_snapshot_id.in_(snapshot_ids),
            AccountSnapshotHolding.grade == grade,
            func.lower(AccountSnapshotHolding.ticker) == ticker_clean.lower(),
            AccountSnapshotHolding.ticker != "CASH",
        )
        .all()
    )
    if not holdings:
        return []
    total_value = sum(Decimal(str(h[0].value)) for h in holdings)
    account_by_id = {acc.id: acc for acc in db.query(MonitoredAccount).filter(
        MonitoredAccount.id.in_({h[1] for h in holdings})
    ).all()}
    result = []
    for h, acc_id in holdings:
        acc = account_by_id.get(acc_id)
        adviser = acc.advisor if acc else None
        partial = (acc.account_display or (acc.synthetic_id[:8] + "…") if acc and acc.synthetic_id else None) if acc else None
        if not partial and acc:
            partial = (acc.synthetic_id or "")[:8] + "…"
        val = Decimal(str(h.value))
        pct = (val / total_value * Decimal("100")).quantize(Decimal("0.01")) if total_value else Decimal("0")
        result.append(
            ConcentrationAccountItem(
                account_id=acc_id,
                adviser=adviser,
                partial_account_number=partial,
                value=val,
                pct_of_total=pct,
            )
        )
    result.sort(key=lambda x: (-float(x.value), x.adviser or "", x.partial_account_number or ""))
    return result


@router.get("/top-offenders", response_model=List[TopOffenderItem])
async def get_top_offenders(
    as_of_date: Optional[date] = None,
    db: Session = Depends(get_db),
):
    """Ranked list of accounts holding the highest dollar volume of Grade 2 assets (lowest hanging fruit)."""
    snapshot_date = as_of_date or _get_latest_snapshot_date(db)
    if not snapshot_date:
        return []

    snapshots = (
        db.query(AccountSnapshot)
        .filter(AccountSnapshot.as_of_date == snapshot_date)
        .all()
    )
    if not snapshots:
        return []

    snapshot_by_account = {s.monitored_account_id: s for s in snapshots}
    snapshot_ids = [s.id for s in snapshots]

    grade2_totals = (
        db.query(
            AccountSnapshotHolding.account_snapshot_id,
            func.coalesce(func.sum(AccountSnapshotHolding.value), 0).label("total"),
        )
        .filter(
            AccountSnapshotHolding.account_snapshot_id.in_(snapshot_ids),
            AccountSnapshotHolding.grade == 2,
        )
        .group_by(AccountSnapshotHolding.account_snapshot_id)
        .all()
    )
    g2_by_snapshot = {row[0]: row[1] for row in grade2_totals if row[1] and float(row[1]) > 0}

    account_ids = [s.monitored_account_id for s in snapshots if s.id in g2_by_snapshot]
    if not account_ids:
        return []

    accounts = db.query(MonitoredAccount).filter(MonitoredAccount.id.in_(account_ids)).all()
    account_by_id = {a.id: a for a in accounts}
    strategy_ids = [a.internal_strategy_id for a in accounts if a.internal_strategy_id is not None]
    strategy_by_id = {}
    if strategy_ids:
        strategies = db.query(Strategy).filter(Strategy.id.in_(strategy_ids)).all()
        strategy_by_id = {s.id: s for s in strategies}

    result = []
    for acc_id in account_ids:
        acc = account_by_id.get(acc_id)
        if not acc:
            continue
        snap = snapshot_by_account.get(acc_id)
        if not snap or snap.id not in g2_by_snapshot:
            continue
        total_g2 = g2_by_snapshot[snap.id]
        strategy = strategy_by_id.get(acc.internal_strategy_id) if acc.internal_strategy_id else None
        result.append(
            TopOffenderItem(
                account_id=acc.id,
                friendly_name=acc.friendly_name,
                synthetic_id=acc.synthetic_id,
                strategy_name=strategy.name if strategy else None,
                total_grade2_value=total_g2,
                as_of_date=snapshot_date,
            )
        )
    result.sort(key=lambda x: -float(x.total_grade2_value))
    return result


@router.get("/unmapped-tickers", response_model=List[UnmappedTickerItem])
async def get_unmapped_tickers(
    as_of_date: Optional[date] = None,
    db: Session = Depends(get_db),
):
    """Tickers in the latest (or given) snapshot that are not in any strategy's product equivalents library."""
    snapshot_date = as_of_date or _get_latest_snapshot_date(db)
    if not snapshot_date:
        return []
    snapshots = db.query(AccountSnapshot).filter(AccountSnapshot.as_of_date == snapshot_date).all()
    if not snapshots:
        return []

    snapshot_ids = [s.id for s in snapshots]
    account_ids = [s.monitored_account_id for s in snapshots]

    accounts = db.query(MonitoredAccount).filter(MonitoredAccount.id.in_(account_ids)).all()
    account_by_id = {a.id: a for a in accounts}

    holdings = (
        db.query(AccountSnapshotHolding)
        .filter(
            AccountSnapshotHolding.account_snapshot_id.in_(snapshot_ids),
            AccountSnapshotHolding.ticker != "CASH",
        )
        .all()
    )
    snapshot_by_id = {s.id: s for s in snapshots}
    holdings_by_snapshot: dict = {}
    for h in holdings:
        sid = h.account_snapshot_id
        if sid not in holdings_by_snapshot:
            holdings_by_snapshot[sid] = []
        holdings_by_snapshot[sid].append(h)

    strategy_ids = [a.internal_strategy_id for a in accounts if a.internal_strategy_id is not None]
    pe_by_strategy: dict = {}
    if strategy_ids:
        product_equivalents = (
            db.query(ProductEquivalent)
            .filter(ProductEquivalent.strategy_id.in_(strategy_ids))
            .all()
        )
        for pe in product_equivalents:
            if pe.strategy_id not in pe_by_strategy:
                pe_by_strategy[pe.strategy_id] = set()
            pe_by_strategy[pe.strategy_id].add(pe.legacy_ticker.strip().lower())

    ticker_strategy_value: dict = {}
    for snap in snapshots:
        acc = account_by_id.get(snap.monitored_account_id)
        if not acc:
            continue
        strategy_id = acc.internal_strategy_id
        pe_legacy = pe_by_strategy.get(strategy_id, set()) if strategy_id else set()
        for h in holdings_by_snapshot.get(snap.id, []):
            ticker = (h.ticker or "").strip()
            if not ticker:
                continue
            if ticker.lower() not in pe_legacy:
                key = (ticker, strategy_id)
                if key not in ticker_strategy_value:
                    ticker_strategy_value[key] = Decimal("0")
                ticker_strategy_value[key] += h.value

    by_ticker: dict = {}
    for (ticker, strategy_id), value in ticker_strategy_value.items():
        if ticker not in by_ticker:
            by_ticker[ticker] = [Decimal("0"), set()]
        by_ticker[ticker][0] += value
        by_ticker[ticker][1].add(strategy_id)

    all_strategy_ids = {sid for _, (_, sids) in by_ticker.items() for sid in sids}
    strategy_names = {}
    if all_strategy_ids:
        strategies = db.query(Strategy).filter(Strategy.id.in_(list(all_strategy_ids))).all()
        strategy_names = {s.id: s.name for s in strategies}

    result = [
        UnmappedTickerItem(
            ticker=ticker,
            total_value=total_value,
            strategy_names=[strategy_names.get(sid, str(sid)) for sid in sorted((s for s in sids if s is not None))],
        )
        for ticker, (total_value, sids) in by_ticker.items()
    ]
    result.sort(key=lambda x: (-float(x.total_value), x.ticker))
    return result


@router.get("/advisers", response_model=List[str])
async def list_advisers(db: Session = Depends(get_db)):
    """List distinct adviser names from monitored accounts (non-null, non-empty), sorted."""
    rows = (
        db.query(MonitoredAccount.advisor)
        .filter(
            MonitoredAccount.advisor.isnot(None),
            MonitoredAccount.advisor != "",
        )
        .distinct()
        .order_by(MonitoredAccount.advisor)
        .all()
    )
    return [r[0].strip() for r in rows if r[0] and r[0].strip()]


@router.get("/adviser-accounts", response_model=AdviserAccountDetailsResponse)
async def get_adviser_account_details(
    adviser: str,
    as_of_date: Optional[date] = None,
    db: Session = Depends(get_db),
):
    """Account details for a selected adviser: table of accounts (partial account, value, legacy ticker, model ticker) and legacy ticker totals."""
    adviser_clean = (adviser or "").strip()
    if not adviser_clean:
        return AdviserAccountDetailsResponse(accounts=[], legacy_totals=[])

    snapshot_date = as_of_date or _get_latest_snapshot_date(db)
    if not snapshot_date:
        return AdviserAccountDetailsResponse(accounts=[], legacy_totals=[])

    accounts = (
        db.query(MonitoredAccount)
        .filter(MonitoredAccount.advisor.isnot(None), MonitoredAccount.advisor == adviser_clean)
        .all()
    )
    if not accounts:
        return AdviserAccountDetailsResponse(accounts=[], legacy_totals=[])

    account_ids = [a.id for a in accounts]
    snapshots = (
        db.query(AccountSnapshot)
        .filter(
            AccountSnapshot.monitored_account_id.in_(account_ids),
            AccountSnapshot.as_of_date == snapshot_date,
        )
        .all()
    )
    snapshot_by_account = {s.monitored_account_id: s for s in snapshots}
    snapshot_ids = [s.id for s in snapshots]

    holdings = (
        db.query(AccountSnapshotHolding)
        .filter(
            AccountSnapshotHolding.account_snapshot_id.in_(snapshot_ids),
            AccountSnapshotHolding.grade.in_([1, 2]),
            AccountSnapshotHolding.ticker != "CASH",
        )
        .all()
    )
    holdings_by_snapshot: dict = {}
    for h in holdings:
        sid = h.account_snapshot_id
        if sid not in holdings_by_snapshot:
            holdings_by_snapshot[sid] = []
        holdings_by_snapshot[sid].append(h)

    strategy_ids = [a.internal_strategy_id for a in accounts if a.internal_strategy_id is not None]
    pe_by_strategy: dict = {}
    if strategy_ids:
        product_equivalents = (
            db.query(ProductEquivalent)
            .filter(ProductEquivalent.strategy_id.in_(strategy_ids))
            .all()
        )
        for pe in product_equivalents:
            if pe.strategy_id not in pe_by_strategy:
                pe_by_strategy[pe.strategy_id] = {}
            key = pe.legacy_ticker.strip().lower()
            pe_by_strategy[pe.strategy_id][key] = (pe.legacy_ticker.strip(), pe.model_ticker.strip())

    detail_rows: List[AdviserAccountDetailItem] = []
    legacy_value_by_ticker: dict = {}  # legacy_ticker -> (total_value, set of account_ids)
    legacy_account_ids_by_ticker: dict = {}  # legacy_ticker -> set(account_id)

    for acc in accounts:
        snap = snapshot_by_account.get(acc.id)
        if not snap:
            continue
        total_value = snap.total_value
        partial = (acc.account_display or (acc.synthetic_id[:8] + "…") if acc.synthetic_id else "") or "—"
        legacy_to_model = pe_by_strategy.get(acc.internal_strategy_id, {}) if acc.internal_strategy_id else {}

        for h in holdings_by_snapshot.get(snap.id, []):
            ticker = (h.ticker or "").strip()
            if not ticker:
                continue
            key = ticker.lower()
            if key not in legacy_to_model:
                continue
            leg, model = legacy_to_model[key]
            detail_rows.append(
                AdviserAccountDetailItem(
                    account_id=acc.id,
                    partial_account_number=partial if partial != "—" else None,
                    account_value=total_value,
                    legacy_ticker=leg,
                    model_ticker=model,
                )
            )
            if leg not in legacy_value_by_ticker:
                legacy_value_by_ticker[leg] = [Decimal("0"), set()]
                legacy_account_ids_by_ticker[leg] = set()
            legacy_value_by_ticker[leg][0] += h.value
            legacy_value_by_ticker[leg][1].add(acc.id)
            legacy_account_ids_by_ticker[leg].add(acc.id)

    legacy_totals = [
        LegacyTickerTotalItem(
            legacy_ticker=ticker,
            total_value=legacy_value_by_ticker[ticker][0],
            account_count=len(legacy_account_ids_by_ticker[ticker]),
        )
        for ticker in sorted(legacy_value_by_ticker.keys())
    ]
    legacy_totals.sort(key=lambda x: (-float(x.total_value), x.legacy_ticker))

    detail_rows.sort(key=lambda x: (x.legacy_ticker, -float(x.account_value), x.partial_account_number or ""))

    return AdviserAccountDetailsResponse(accounts=detail_rows, legacy_totals=legacy_totals)
