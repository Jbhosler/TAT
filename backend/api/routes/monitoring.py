"""
Monitoring module endpoints: strategy name mapping, ingest, accounts, snapshots.
"""
import hashlib
import logging
from datetime import date
from typing import List, Optional
from uuid import UUID
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import desc, func

from backend.database.connection import get_db
from backend.api.models.database import (
    Strategy,
    StrategyPosition,
    ProductEquivalent,
    StrategyNameMapping,
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
    SnapshotWithBreakdown,
    AssetClassAllocation,
    ConcentrationReportItem,
    ConcentrationAccountItem,
    TopOffenderItem,
    UnmappedTickerItem,
)
from backend.utils.csv_parser import parse_aggregated_holdings_csv
from backend.logic.monitor_engine import (
    compute_rollup_and_scores,
    get_allocations_breakdown,
)

logger = logging.getLogger(__name__)
router = APIRouter()


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
):
    """Ingest aggregated holdings CSV. Saves accounts and snapshots; heat map is computed only when a new file is ingested (duplicate file skipped)."""
    body = await request.body()
    csv_content = body.decode("utf-8-sig").strip()
    file_checksum = _file_checksum(csv_content)

    # Skip processing if the same file was already ingested (heat map calculation only on new file)
    latest_run = (
        db.query(MonitoringIngestRun)
        .order_by(desc(MonitoringIngestRun.ingested_at))
        .first()
    )
    if latest_run and latest_run.file_checksum == file_checksum:
        logger.info("Monitoring ingest: same file already ingested (checksum %s), skipping", file_checksum[:16])
        return IngestResponse(
            ingested_count=0,
            skipped_count=0,
            data_inconsistency_synthetic_ids=[],
            as_of_date=latest_run.as_of_date,
            last_ingest_at=latest_run.ingested_at,
        )

    try:
        groups = parse_aggregated_holdings_csv(csv_content)
    except Exception as e:
        logger.warning("Aggregated CSV parse error: %s", e)
        raise HTTPException(status_code=400, detail=str(e))

    mapping_by_name = {
        m.external_model_name.strip().lower(): m.internal_strategy_id
        for m in db.query(StrategyNameMapping).all()
    }

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
        if key not in mapping_by_name:
            skipped_count += 1
            continue
        internal_strategy_id = mapping_by_name[key]
        as_of_date_used = g.get("as_of_date") or date.today()

        account = db.query(MonitoredAccount).filter(
            MonitoredAccount.synthetic_id == g["synthetic_id"]
        ).first()
        firm = (g.get("firm") or "").strip() or None
        advisor = (g.get("advisor") or "").strip() or None
        account_display = (g.get("account_display") or "").strip() or None
        if not account:
            account = MonitoredAccount(
                synthetic_id=g["synthetic_id"],
                friendly_name=None,
                internal_strategy_id=internal_strategy_id,
                firm=firm,
                advisor=advisor,
                account_display=account_display,
            )
            db.add(account)
            db.flush()
        else:
            account.firm = firm
            account.advisor = advisor
            account.account_display = account_display

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
        else:
            snapshot = AccountSnapshot(
                monitored_account_id=account.id,
                as_of_date=as_of_date_used,
                total_value=g["total_value"],
                total_deviation_score=deviation_score,
                purity_score=purity_score,
                cash_pct=cash_pct,
            )
            db.add(snapshot)
            db.flush()

        total_value = Decimal(str(g["total_value"]))
        for h in holdings_with_meta:
            db.add(AccountSnapshotHolding(
                account_snapshot_id=snapshot.id,
                ticker=h.get("ticker", ""),
                asset_class=h.get("asset_class"),
                value=Decimal(str(h.get("value", 0))),
                weight_pct=Decimal(str(h.get("weight_pct", 0))) if h.get("weight_pct") is not None else None,
                grade=h.get("grade"),
            ))
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
    db: Session = Depends(get_db),
):
    """List monitored accounts with latest (or given as_of_date) snapshot for heat map."""
    accounts = db.query(MonitoredAccount).all()
    result = []
    for acc in accounts:
        q = db.query(AccountSnapshot).filter(AccountSnapshot.monitored_account_id == acc.id)
        if as_of_date is not None:
            q = q.filter(AccountSnapshot.as_of_date == as_of_date)
        snapshot = q.order_by(AccountSnapshot.as_of_date.desc()).first()
        strategy = db.query(Strategy).filter(Strategy.id == acc.internal_strategy_id).first()
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

    positions_data = [
        {"model_ticker": p.model_ticker, "asset_class": p.asset_class.value, "target_allocation": float(p.target_allocation)}
        for p in db.query(StrategyPosition).filter(StrategyPosition.strategy_id == account.internal_strategy_id).all()
    ]
    pe_data = [
        {"legacy_ticker": pe.legacy_ticker, "model_ticker": pe.model_ticker, "grade": pe.grade}
        for pe in db.query(ProductEquivalent).filter(ProductEquivalent.strategy_id == account.internal_strategy_id).all()
    ]
    target_by_ac = _build_target_by_ac(account.internal_strategy_id, db)

    result = []
    for snap in snapshots:
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
    for h, acc_id in holdings:
        key = (h.ticker.strip(), h.grade)
        if key not in agg:
            agg[key] = [Decimal("0"), set()]
        agg[key][0] += h.value
        agg[key][1].add(acc_id)
    result = []
    for (ticker, grade), (total_value, account_ids) in agg.items():
        ac = None
        for h, _ in holdings:
            if h.ticker.strip() == ticker and h.grade == grade:
                ac = h.asset_class
                break
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
    accounts = db.query(MonitoredAccount).all()
    snapshot_date = as_of_date or _get_latest_snapshot_date(db)
    if not snapshot_date:
        return []
    result = []
    for acc in accounts:
        snap = (
            db.query(AccountSnapshot)
            .filter(
                AccountSnapshot.monitored_account_id == acc.id,
                AccountSnapshot.as_of_date == snapshot_date,
            )
            .first()
        )
        if not snap:
            continue
        grade2_value = (
            db.query(AccountSnapshotHolding.value)
            .filter(
                AccountSnapshotHolding.account_snapshot_id == snap.id,
                AccountSnapshotHolding.grade == 2,
            )
            .all()
        )
        total_g2 = sum(Decimal(str(v[0])) for v in grade2_value)
        if total_g2 <= 0:
            continue
        strategy = db.query(Strategy).filter(Strategy.id == acc.internal_strategy_id).first()
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
    # (ticker, strategy_id) -> total_value, we'll mark unmapped
    ticker_strategy_value: dict = {}
    for snap in snapshots:
        acc = db.query(MonitoredAccount).filter(MonitoredAccount.id == snap.monitored_account_id).first()
        if not acc:
            continue
        strategy_id = acc.internal_strategy_id
        holdings = (
            db.query(AccountSnapshotHolding)
            .filter(
                AccountSnapshotHolding.account_snapshot_id == snap.id,
                AccountSnapshotHolding.ticker != "CASH",
            )
            .all()
        )
        pe_legacy = {
            pe.legacy_ticker.strip().lower()
            for pe in db.query(ProductEquivalent).filter(ProductEquivalent.strategy_id == strategy_id).all()
        }
        for h in holdings:
            ticker = (h.ticker or "").strip()
            if not ticker:
                continue
            if ticker.lower() not in pe_legacy:
                key = (ticker, strategy_id)
                if key not in ticker_strategy_value:
                    ticker_strategy_value[key] = Decimal("0")
                ticker_strategy_value[key] += h.value
    # Aggregate by ticker: total_value, list of strategy names
    by_ticker: dict = {}  # ticker -> (total_value, set of strategy_ids)
    for (ticker, strategy_id), value in ticker_strategy_value.items():
        if ticker not in by_ticker:
            by_ticker[ticker] = [Decimal("0"), set()]
        by_ticker[ticker][0] += value
        by_ticker[ticker][1].add(strategy_id)
    strategy_names = {
        s.id: s.name
        for s in db.query(Strategy).filter(Strategy.id.in_(list({sid for _, (_, sids) in by_ticker.items() for sid in sids}))).all()
    }
    result = [
        UnmappedTickerItem(
            ticker=ticker,
            total_value=total_value,
            strategy_names=[strategy_names.get(sid, str(sid)) for sid in sorted(strategy_ids)],
        )
        for ticker, (total_value, strategy_ids) in by_ticker.items()
    ]
    result.sort(key=lambda x: (-float(x.total_value), x.ticker))
    return result
