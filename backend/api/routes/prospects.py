"""
Prospect transition endpoints.
"""
import logging
import re
from fastapi import APIRouter, Depends, HTTPException, Request, File, UploadFile, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID
from decimal import Decimal
from backend.database.connection import get_db
from backend.api.deps import get_current_user
from backend.api.models.database import (
    Prospect, ProspectHolding, ProductEquivalent, TickerMapping, TransitionResult,
    MappingStatus, Strategy, MonitoredAccount, StrategyPosition
)
from backend.api.models.schemas import (
    ProspectCreate,
    ProspectResponse,
    ProspectHoldingResponse,
    ProspectListItem,
    ProspectLinkAccountRequest,
    ClassifySidePocketRequest,
    TickerMappingCreate,
    TickerMappingResponse,
    ForceSaleRequest,
    TransitionResultResponse,
    UpdateProspectTargetRequest,
    ProspectHoldingsUpdateRequest,
    StrategyAccountLinkResponse,
    UpdateStrategyAccountLinksRequest,
)
from backend.utils.csv_parser import parse_prospect_csv
from backend.utils.pdf_generator import build_transition_report_pdf
from backend.logic.rebalancer import (
    Holding, MappedHolding, rebalance, classify_holdings, normalize_ticker
)
from backend.logic.strategy_blend import (
    StrategyBlendError,
    build_blended_positions,
    load_blended_product_equivalents,
    primary_strategy_id,
    blend_version_snapshot,
    is_blend_stale,
    components_with_versions,
    blend_display_name,
)
import json

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(get_current_user)])


def _load_effective_product_equivalents(db: Session, strategy: Strategy) -> tuple[list[ProductEquivalent], str]:
    """
    Load product equivalents for the active strategy. Each strategy strictly uses
    its own equivalents file; a strategy with none simply has no auto-mappings.
    Returns (equivalents, source_strategy_name).
    """
    direct = db.query(ProductEquivalent).filter(
        ProductEquivalent.strategy_id == strategy.id
    ).all()
    return direct, strategy.name


def _blend_components_from_prospect(prospect: Prospect) -> list[dict] | None:
    blend = prospect.strategy_blend
    if not blend or not isinstance(blend, list) or len(blend) == 0:
        return None
    return blend


def _prospect_display_strategy_name(db: Session, prospect: Prospect) -> str | None:
    blend = _blend_components_from_prospect(prospect)
    if blend:
        strategy_ids = [UUID(str(c["strategy_id"])) for c in blend]
        strategies = db.query(Strategy).filter(Strategy.id.in_(strategy_ids)).all()
        strategies_by_id = {s.id: s for s in strategies}
        try:
            return blend_display_name(strategies_by_id, blend)
        except StrategyBlendError:
            return None
    strategy = db.query(Strategy).filter(Strategy.id == prospect.strategy_id).first()
    return strategy.name if strategy else None


def _resolve_strategy_target(
    db: Session,
    prospect: Prospect,
) -> tuple[list[dict], str, int, dict[str, int]]:
    """
    Build effective strategy positions for a prospect (single or blend).
    Returns (positions, display_name, version_for_result, versions_snapshot).
    """
    blend = _blend_components_from_prospect(prospect)
    if blend:
        positions, strategies_by_id, display_name = build_blended_positions(db, blend)
        versions_snapshot = blend_version_snapshot(db, blend)
        version_for_result = max(versions_snapshot.values()) if versions_snapshot else 1
        return positions, display_name, version_for_result, versions_snapshot

    strategy = db.query(Strategy).filter(Strategy.id == prospect.strategy_id).first()
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")
    positions_db = db.query(StrategyPosition).filter(
        StrategyPosition.strategy_id == strategy.id
    ).all()
    positions = [{
        'model_ticker': pos.model_ticker,
        'asset_class': pos.asset_class.value,
        'target_allocation': float(pos.target_allocation),
        'drift_percentage': float(pos.drift_percentage),
    } for pos in positions_db]
    snapshot = {str(strategy.id): strategy.version}
    return positions, strategy.name, strategy.version, snapshot


def _is_cash_ticker(ticker: str) -> bool:
    return (ticker or "").upper().strip() == "CASH"


def _sync_mapping_status_after_target_change(db: Session, prospect: Prospect) -> None:
    """
    Reconcile holding mapping_status after target strategy/blend changes.
    Manual mappings, forced sales, and side pockets are preserved; everything else
    resets to UNMAPPED. Product-equivalent coverage is not stored on the holding —
    it is computed dynamically (see /unmapped and /mapping-review).
    """
    manual_tickers = {
        m.legacy_ticker
        for m in db.query(TickerMapping).filter(TickerMapping.prospect_id == prospect.id).all()
    }
    holdings = db.query(ProspectHolding).filter(ProspectHolding.prospect_id == prospect.id).all()
    for h in holdings:
        if h.is_side_pocket:
            continue
        if h.ticker in manual_tickers:
            continue
        if h.mapping_status == MappingStatus.FORCED_SALE:
            continue
        h.mapping_status = MappingStatus.UNMAPPED


def _clear_transition_results(db: Session, prospect_id: UUID) -> None:
    db.query(TransitionResult).filter(TransitionResult.prospect_id == prospect_id).delete()


def _target_strategy_ids(prospect: Prospect) -> list[UUID]:
    blend = _blend_components_from_prospect(prospect)
    if blend:
        return [UUID(str(c["strategy_id"])) for c in blend]
    return [prospect.strategy_id]


def _strategy_account_links_response(
    db: Session,
    prospect: Prospect,
) -> list[StrategyAccountLinkResponse]:
    stored = prospect.strategy_account_links or []
    stored_by_strategy = {
        UUID(str(item["strategy_id"])): item.get("monitored_account_id")
        for item in stored
        if item.get("strategy_id")
    }
    account_ids = [
        UUID(str(aid)) for aid in stored_by_strategy.values() if aid is not None
    ]
    accounts_by_id = {}
    if account_ids:
        accounts = db.query(MonitoredAccount).filter(MonitoredAccount.id.in_(account_ids)).all()
        accounts_by_id = {a.id: a for a in accounts}

    strategy_ids = _target_strategy_ids(prospect)
    strategies = db.query(Strategy).filter(Strategy.id.in_(strategy_ids)).all()
    strategies_by_id = {s.id: s for s in strategies}

    out: list[StrategyAccountLinkResponse] = []
    for sid in strategy_ids:
        raw_aid = stored_by_strategy.get(sid)
        aid = UUID(str(raw_aid)) if raw_aid else None
        acc = accounts_by_id.get(aid) if aid else None
        display = None
        if acc:
            display = acc.friendly_name or acc.synthetic_id
            if acc.account_display:
                display = f"{display} ({acc.account_display})"
        out.append(StrategyAccountLinkResponse(
            strategy_id=sid,
            strategy_name=strategies_by_id[sid].name if sid in strategies_by_id else None,
            monitored_account_id=aid,
            account_display=display,
        ))
    return out


def _target_positions_payload(positions: list[dict]) -> list[dict]:
    """Snapshot rows sorted by target % descending (per model ticker)."""
    return sorted(positions, key=lambda p: -float(p["target_allocation"]))


def _asset_class_order_from_positions(positions: list[dict]) -> list[str]:
    """Asset class display order from target positions (highest target ticker first per class)."""
    order: list[str] = []
    seen: set[str] = set()
    for p in sorted(positions, key=lambda x: -float(x["target_allocation"])):
        ac = str(p["asset_class"])
        if ac not in seen:
            order.append(ac)
            seen.add(ac)
    return order


def _resolve_target_positions_for_result(
    db: Session,
    prospect: Prospect,
    result: TransitionResult | None,
) -> tuple[list[dict], str]:
    if result is not None:
        stored = getattr(result, "target_positions", None)
        if stored:
            return _normalize_jsonb(stored), (_prospect_display_strategy_name(db, prospect) or "")
    positions, display_name, _, _ = _resolve_strategy_target(db, prospect)
    return _target_positions_payload(positions), display_name


def _linked_accounts_summary(db: Session, prospect: Prospect) -> str | None:
    links = _strategy_account_links_response(db, prospect)
    names = [l.account_display for l in links if l.account_display]
    if names:
        return "; ".join(names)
    if prospect.monitored_account_id:
        acc = db.query(MonitoredAccount).filter(MonitoredAccount.id == prospect.monitored_account_id).first()
        if acc:
            return acc.friendly_name or acc.synthetic_id
    return None


def _resolve_product_equivalents_dict(db: Session, prospect: Prospect) -> dict:
    blend = _blend_components_from_prospect(prospect)
    if blend:
        pe_dict, _ = load_blended_product_equivalents(
            db, blend, _load_effective_product_equivalents
        )
        return pe_dict

    strategy = db.query(Strategy).filter(Strategy.id == prospect.strategy_id).first()
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")
    product_equivalents_db, _ = _load_effective_product_equivalents(db, strategy)
    product_equivalents: dict = {}
    for pe in product_equivalents_db:
        legacy = normalize_ticker(pe.legacy_ticker)
        if legacy not in product_equivalents:
            product_equivalents[legacy] = {}
        # First-wins on duplicate (legacy, model) pairs, consistent with the blend merge
        if pe.model_ticker not in product_equivalents[legacy]:
            product_equivalents[legacy][pe.model_ticker] = pe.grade if pe.grade is not None else 2
    return product_equivalents


@router.get("", response_model=List[ProspectListItem])
async def list_prospects(db: Session = Depends(get_db)):
    """List all saved prospect scenarios (name, strategy, total value, created, has result)."""
    prospects = db.query(Prospect).order_by(Prospect.created_at.desc()).all()
    result_ids = {
        r[0] for r in db.query(TransitionResult.prospect_id).distinct().all()
    }
    account_ids = [p.monitored_account_id for p in prospects if p.monitored_account_id is not None]
    accounts_by_id = {}
    if account_ids:
        accounts = db.query(MonitoredAccount).filter(MonitoredAccount.id.in_(account_ids)).all()
        accounts_by_id = {a.id: a for a in accounts}
    out = []
    for p in prospects:
        acc = accounts_by_id.get(p.monitored_account_id) if p.monitored_account_id else None
        linked_name = _linked_accounts_summary(db, p) or (
            (acc.friendly_name or acc.synthetic_id) if acc else None
        )
        out.append(ProspectListItem(
            id=p.id,
            name=p.name,
            strategy_id=p.strategy_id,
            strategy_name=_prospect_display_strategy_name(db, p),
            total_value=p.total_value,
            created_at=p.created_at,
            has_result=p.id in result_ids,
            has_document=p.document_pdf is not None,
            monitored_account_id=p.monitored_account_id,
            linked_account_name=linked_name,
        ))
    return out


@router.delete("/{prospect_id}")
async def delete_prospect(
    prospect_id: UUID,
    db: Session = Depends(get_db)
):
    """Delete a prospect scenario and all associated data (holdings, mappings, results)."""
    prospect = db.query(Prospect).filter(Prospect.id == prospect_id).first()
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospect not found")
    db.delete(prospect)
    db.commit()
    return {"message": "Prospect deleted"}


@router.get("/{prospect_id}/linkable-accounts")
async def get_linkable_accounts(
    prospect_id: UUID,
    strategy_id: UUID | None = Query(None, description="Strategy to match (required for blends)"),
    db: Session = Depends(get_db),
):
    """List monitored accounts mapped to a given target strategy (for manual linking)."""
    prospect = db.query(Prospect).filter(Prospect.id == prospect_id).first()
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospect not found")

    allowed_ids = {str(sid) for sid in _target_strategy_ids(prospect)}
    effective_sid = strategy_id or prospect.strategy_id
    if str(effective_sid) not in allowed_ids:
        raise HTTPException(status_code=400, detail="strategy_id is not part of this prospect's target")

    accounts = (
        db.query(MonitoredAccount)
        .filter(
            MonitoredAccount.internal_strategy_id == effective_sid,
            MonitoredAccount.internal_strategy_id.isnot(None),
        )
        .order_by(MonitoredAccount.friendly_name.asc().nullslast(), MonitoredAccount.synthetic_id.asc())
        .all()
    )
    return [
        {
            "id": str(a.id),
            "synthetic_id": a.synthetic_id,
            "friendly_name": a.friendly_name,
            "account_display": a.account_display,
            "advisor": a.advisor,
        }
        for a in accounts
    ]


@router.patch("/{prospect_id}/link-account")
async def link_prospect_to_account(
    prospect_id: UUID,
    body: ProspectLinkAccountRequest,
    db: Session = Depends(get_db)
):
    """Link a prospect scenario to a monitored account (or unlink if monitored_account_id is null)."""
    prospect = db.query(Prospect).filter(Prospect.id == prospect_id).first()
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospect not found")
    if body.monitored_account_id is not None:
        account = db.query(MonitoredAccount).filter(MonitoredAccount.id == body.monitored_account_id).first()
        if not account:
            raise HTTPException(status_code=404, detail="Account not found")
        if account.internal_strategy_id != prospect.strategy_id:
            raise HTTPException(
                status_code=400,
                detail="Account must use the same strategy as the prospect"
            )
    prospect.monitored_account_id = body.monitored_account_id
    if body.monitored_account_id is not None:
        prospect.strategy_account_links = [{
            "strategy_id": str(prospect.strategy_id),
            "monitored_account_id": str(body.monitored_account_id),
        }]
    else:
        prospect.strategy_account_links = []
    db.commit()
    return {"message": "Link updated", "monitored_account_id": str(body.monitored_account_id) if body.monitored_account_id else None}


@router.get("/{prospect_id}", response_model=ProspectResponse)
async def get_prospect(
    prospect_id: UUID,
    db: Session = Depends(get_db),
):
    """Get prospect with holdings and target configuration."""
    prospect = db.query(Prospect).filter(Prospect.id == prospect_id).first()
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospect not found")
    return _prospect_to_response(prospect, db)


@router.get("/{prospect_id}/strategy-account-links", response_model=List[StrategyAccountLinkResponse])
async def get_strategy_account_links(
    prospect_id: UUID,
    db: Session = Depends(get_db),
):
    """Current per-strategy monitored account links for this prospect."""
    prospect = db.query(Prospect).filter(Prospect.id == prospect_id).first()
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospect not found")
    return _strategy_account_links_response(db, prospect)


@router.put("/{prospect_id}/strategy-account-links", response_model=List[StrategyAccountLinkResponse])
async def update_strategy_account_links(
    prospect_id: UUID,
    body: UpdateStrategyAccountLinksRequest,
    db: Session = Depends(get_db),
):
    """Manually link each target strategy to a monitored account (one Envestnet account per strategy)."""
    prospect = db.query(Prospect).filter(Prospect.id == prospect_id).first()
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospect not found")

    allowed_ids = {str(sid) for sid in _target_strategy_ids(prospect)}
    links_db: list[dict] = []
    primary_account_id = None

    for link in body.links:
        sid_str = str(link.strategy_id)
        if sid_str not in allowed_ids:
            raise HTTPException(
                status_code=400,
                detail=f"strategy_id {sid_str} is not part of this prospect's target",
            )
        if link.monitored_account_id is not None:
            account = db.query(MonitoredAccount).filter(
                MonitoredAccount.id == link.monitored_account_id
            ).first()
            if not account:
                raise HTTPException(status_code=404, detail="Account not found")
            if account.internal_strategy_id != link.strategy_id:
                raise HTTPException(
                    status_code=400,
                    detail=f"Account must use strategy {sid_str}",
                )
        links_db.append({
            "strategy_id": sid_str,
            "monitored_account_id": str(link.monitored_account_id) if link.monitored_account_id else None,
        })
        if link.monitored_account_id and primary_account_id is None:
            primary_account_id = link.monitored_account_id

    prospect.strategy_account_links = links_db
    prospect.monitored_account_id = primary_account_id
    db.commit()
    db.refresh(prospect)
    return _strategy_account_links_response(db, prospect)


@router.post("/{prospect_id}/document")
async def upload_prospect_document(
    prospect_id: UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """Upload a PDF document for a prospect. Replaces any existing document."""
    prospect = db.query(Prospect).filter(Prospect.id == prospect_id).first()
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospect not found")
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename")
    ct = (file.content_type or "").lower()
    if ct != "application/pdf" and not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="File must be a PDF")
    data = await file.read()
    if len(data) > 20 * 1024 * 1024:  # 20 MB limit
        raise HTTPException(status_code=400, detail="PDF must be under 20 MB")
    prospect.document_pdf = data
    prospect.document_filename = file.filename[:255]
    db.commit()
    return {"message": "Document uploaded", "filename": prospect.document_filename}


@router.get("/{prospect_id}/document")
async def get_prospect_document(
    prospect_id: UUID,
    db: Session = Depends(get_db)
):
    """Download the prospect's stored PDF document."""
    prospect = db.query(Prospect).filter(Prospect.id == prospect_id).first()
    if not prospect or not prospect.document_pdf:
        raise HTTPException(status_code=404, detail="No document found")
    filename = prospect.document_filename or "document.pdf"
    return Response(
        content=bytes(prospect.document_pdf),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _prospect_to_response(prospect: Prospect, db: Session) -> ProspectResponse:
    """Build ProspectResponse from ORM while session is still open."""
    holdings_resp = [ProspectHoldingResponse.model_validate(h) for h in prospect.holdings]
    blend = prospect.strategy_blend
    return ProspectResponse(
        id=prospect.id,
        strategy_id=prospect.strategy_id,
        strategy_blend=blend if blend else None,
        name=prospect.name,
        total_value=prospect.total_value,
        holdings=holdings_resp,
        has_document=prospect.document_pdf is not None,
        strategy_account_links=_strategy_account_links_response(db, prospect),
        created_at=prospect.created_at,
        updated_at=prospect.updated_at,
    )


@router.patch("/{prospect_id}/target", response_model=ProspectResponse)
async def update_prospect_target(
    prospect_id: UUID,
    body: UpdateProspectTargetRequest,
    db: Session = Depends(get_db),
):
    """Update target strategy or weighted blend for an existing prospect."""
    prospect = db.query(Prospect).filter(Prospect.id == prospect_id).first()
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospect not found")

    blend_data = None
    if body.strategy_blend:
        blend_data = [
            {"strategy_id": str(c.strategy_id), "weight": float(c.weight)}
            for c in body.strategy_blend
        ]
        try:
            effective_id = primary_strategy_id(blend_data)
        except StrategyBlendError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
    else:
        effective_id = body.strategy_id
        strategy = db.query(Strategy).filter(Strategy.id == effective_id).first()
        if not strategy:
            raise HTTPException(status_code=404, detail="Strategy not found")

    prospect.strategy_id = effective_id
    prospect.strategy_blend = blend_data
    _sync_mapping_status_after_target_change(db, prospect)
    _clear_transition_results(db, prospect_id)
    db.commit()
    db.refresh(prospect)
    return _prospect_to_response(prospect, db)


@router.put("/{prospect_id}/holdings", response_model=ProspectResponse)
async def update_prospect_holdings(
    prospect_id: UUID,
    body: ProspectHoldingsUpdateRequest,
    db: Session = Depends(get_db),
):
    """Replace prospect holdings. Preserves mappings for tickers that still exist."""
    prospect = db.query(Prospect).filter(Prospect.id == prospect_id).first()
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospect not found")
    if not body.holdings:
        raise HTTPException(status_code=400, detail="At least one holding is required")

    tickers = [h.ticker for h in body.holdings]
    if len(tickers) != len(set(tickers)):
        raise HTTPException(status_code=400, detail="Duplicate tickers are not allowed")

    if body.name and body.name.strip():
        prospect.name = body.name.strip()

    existing_holdings = db.query(ProspectHolding).filter(
        ProspectHolding.prospect_id == prospect_id
    ).all()
    existing_by_ticker = {h.ticker: h for h in existing_holdings}
    new_tickers = {h.ticker for h in body.holdings}

    for ticker, holding in existing_by_ticker.items():
        if ticker not in new_tickers:
            db.delete(holding)

    manual_tickers = {
        m.legacy_ticker
        for m in db.query(TickerMapping).filter(TickerMapping.prospect_id == prospect_id).all()
    }
    for m in db.query(TickerMapping).filter(TickerMapping.prospect_id == prospect_id).all():
        if m.legacy_ticker not in new_tickers:
            db.delete(m)

    total_value = Decimal("0")
    for holding_data in body.holdings:
        total_value += Decimal(str(holding_data.value))
        prev = existing_by_ticker.get(holding_data.ticker)
        if prev:
            prev.value = holding_data.value
            prev.unrealized_gain_loss = holding_data.unrealized_gain_loss
            if prev.ticker not in manual_tickers and prev.mapping_status != MappingStatus.FORCED_SALE:
                prev.mapping_status = MappingStatus.UNMAPPED
        else:
            db.add(ProspectHolding(
                prospect_id=prospect_id,
                ticker=holding_data.ticker,
                value=holding_data.value,
                unrealized_gain_loss=holding_data.unrealized_gain_loss,
                is_side_pocket=False,
                mapping_status=MappingStatus.UNMAPPED,
            ))

    prospect.total_value = total_value
    _clear_transition_results(db, prospect_id)
    db.commit()
    db.refresh(prospect)
    return _prospect_to_response(prospect, db)


@router.post("/upload", response_model=ProspectResponse)
async def upload_prospect(
    request: Request,
    strategy_id: UUID,
    name: str,
    strategy_blend: str | None = None,
    db: Session = Depends(get_db)
):
    """Upload prospect CSV and create prospect. Accepts raw CSV body (text/csv or text/plain)."""
    # Read raw body so we accept text/csv (FastAPI would otherwise expect JSON and return 422)
    body = await request.body()
    csv_content = body.decode("utf-8-sig").strip()

    blend_data = None
    if strategy_blend:
        try:
            blend_data = json.loads(strategy_blend)
            if not isinstance(blend_data, list):
                raise ValueError("strategy_blend must be a JSON array")
            primary_strategy_id(blend_data)
        except (json.JSONDecodeError, StrategyBlendError, ValueError) as e:
            raise HTTPException(status_code=400, detail=f"Invalid strategy_blend: {e}") from e

    try:
        holdings_data = parse_prospect_csv(csv_content)

        # Calculate total value
        total_value = sum(Decimal(str(h['value'])) for h in holdings_data)

        effective_strategy_id = primary_strategy_id(blend_data) if blend_data else strategy_id

        # Create prospect
        db_prospect = Prospect(
            strategy_id=effective_strategy_id,
            strategy_blend=blend_data,
            name=name,
            total_value=total_value
        )
        db.add(db_prospect)
        db.flush()

        # Create holdings
        for holding_data in holdings_data:
            db_holding = ProspectHolding(
                prospect_id=db_prospect.id,
                ticker=holding_data['ticker'],
                value=holding_data['value'],
                unrealized_gain_loss=holding_data['unrealized_gain_loss'],
                is_side_pocket=False,  # Will be classified in next step
                mapping_status=MappingStatus.UNMAPPED
            )
            db.add(db_holding)

        db.commit()
        db.refresh(db_prospect)
        return _prospect_to_response(db_prospect, db)

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{prospect_id}/holdings", response_model=List[ProspectHoldingResponse])
async def get_prospect_holdings(
    prospect_id: UUID,
    db: Session = Depends(get_db),
):
    """List all holdings for a prospect (for classify / review)."""
    prospect = db.query(Prospect).filter(Prospect.id == prospect_id).first()
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospect not found")
    holdings = (
        db.query(ProspectHolding)
        .filter(ProspectHolding.prospect_id == prospect_id)
        .order_by(ProspectHolding.ticker.asc())
        .all()
    )
    return [ProspectHoldingResponse.model_validate(h) for h in holdings]


@router.post("/{prospect_id}/classify")
async def classify_prospect_holdings(
    prospect_id: UUID,
    body: ClassifySidePocketRequest,
    db: Session = Depends(get_db),
):
    """Set side-pocket flags from user selection. Unchecked holdings are rebalanceable and can be mapped next."""
    prospect = db.query(Prospect).filter(Prospect.id == prospect_id).first()
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospect not found")

    holdings = db.query(ProspectHolding).filter(
        ProspectHolding.prospect_id == prospect_id
    ).all()
    if not holdings:
        raise HTTPException(status_code=400, detail="No holdings to classify")

    by_id = {h.id: h for h in holdings}
    sp_ids = set(body.side_pocket_holding_ids)
    unknown = sp_ids - set(by_id.keys())
    if unknown:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown holding id(s) for this prospect: {sorted(str(u) for u in unknown)}",
        )

    side_pocket_count = 0
    for h in holdings:
        h.is_side_pocket = h.id in sp_ids
        if h.is_side_pocket:
            side_pocket_count += 1

    _clear_transition_results(db, prospect_id)
    db.commit()

    return {
        "message": "Holdings classified",
        "side_pocket_count": side_pocket_count,
        "rebalanceable_count": len(holdings) - side_pocket_count,
    }


@router.get("/{prospect_id}/unmapped", response_model=List[ProspectHoldingResponse])
async def get_unmapped_holdings(
    prospect_id: UUID,
    db: Session = Depends(get_db)
):
    """Get holdings that need manual mapping. Excludes holdings that already have a product equivalent (GE_Alt.csv) for this strategy. CASH is excluded—it is auto-mapped to the Cash asset class during rebalance."""
    prospect = db.query(Prospect).filter(Prospect.id == prospect_id).first()
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospect not found")

    # Holdings with mapping_status UNMAPPED and not side pocket
    holdings = db.query(ProspectHolding).filter(
        ProspectHolding.prospect_id == prospect_id,
        ProspectHolding.mapping_status == MappingStatus.UNMAPPED,
        ProspectHolding.is_side_pocket == False
    ).all()

    product_equivalents = _resolve_product_equivalents_dict(db, prospect)
    tickers_with_equivalent = set(product_equivalents.keys())

    # Return only holdings that have no product equivalent (truly need user mapping)
    need_mapping = [
        h for h in holdings
        if not _is_cash_ticker(h.ticker) and normalize_ticker(h.ticker) not in tickers_with_equivalent
    ]
    return [ProspectHoldingResponse.model_validate(h) for h in need_mapping]


@router.get("/{prospect_id}/mapping-review", response_model=List[ProspectHoldingResponse])
async def get_mapping_review_holdings(
    prospect_id: UUID,
    db: Session = Depends(get_db),
):
    """Rebalanceable holdings worth reviewing: manual mappings, forced sale, or no product equivalent."""
    prospect = db.query(Prospect).filter(Prospect.id == prospect_id).first()
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospect not found")

    product_equivalents = _resolve_product_equivalents_dict(db, prospect)
    manual_tickers = {
        m.legacy_ticker
        for m in db.query(TickerMapping).filter(TickerMapping.prospect_id == prospect_id).all()
    }
    holdings = (
        db.query(ProspectHolding)
        .filter(
            ProspectHolding.prospect_id == prospect_id,
            ProspectHolding.is_side_pocket == False,
        )
        .order_by(ProspectHolding.ticker.asc())
        .all()
    )
    review = []
    for h in holdings:
        if h.mapping_status in (
            MappingStatus.MAPPED,
            MappingStatus.MULTI_ASSET,
            MappingStatus.FORCED_SALE,
        ) or h.ticker in manual_tickers:
            review.append(h)
        elif not _is_cash_ticker(h.ticker) and normalize_ticker(h.ticker) not in product_equivalents:
            review.append(h)
    return [ProspectHoldingResponse.model_validate(h) for h in review]


@router.get("/{prospect_id}/mappings", response_model=List[TickerMappingResponse])
async def get_prospect_mappings(
    prospect_id: UUID,
    db: Session = Depends(get_db),
):
    """List saved manual ticker mappings for a prospect."""
    prospect = db.query(Prospect).filter(Prospect.id == prospect_id).first()
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospect not found")
    mappings = (
        db.query(TickerMapping)
        .filter(TickerMapping.prospect_id == prospect_id)
        .order_by(TickerMapping.legacy_ticker.asc())
        .all()
    )
    return [TickerMappingResponse.model_validate(m) for m in mappings]


def _dollar_split_for_db(value):
    """Convert dollar_split dict to JSON-serializable form (Decimal -> float) for JSONB column."""
    if value is None or not isinstance(value, dict):
        return None
    return {k: float(v) for k, v in value.items()}


@router.post("/{prospect_id}/map", response_model=TickerMappingResponse)
async def save_manual_mapping(
    prospect_id: UUID,
    mapping: TickerMappingCreate,
    db: Session = Depends(get_db)
):
    """Save manual ticker mapping (Option C)."""
    dollar_split_db = _dollar_split_for_db(mapping.dollar_split)

    # Check if mapping already exists
    existing = db.query(TickerMapping).filter(
        TickerMapping.prospect_id == prospect_id,
        TickerMapping.legacy_ticker == mapping.legacy_ticker
    ).first()
    
    if existing:
        # Update existing mapping
        existing.model_ticker = mapping.model_ticker
        existing.grade = mapping.grade
        existing.dollar_split = dollar_split_db
    else:
        # Create new mapping
        existing = TickerMapping(
            prospect_id=prospect_id,
            legacy_ticker=mapping.legacy_ticker,
            model_ticker=mapping.model_ticker,
            grade=mapping.grade,
            dollar_split=dollar_split_db
        )
        db.add(existing)
    
    # Update holding mapping status
    holding = db.query(ProspectHolding).filter(
        ProspectHolding.prospect_id == prospect_id,
        ProspectHolding.ticker == mapping.legacy_ticker
    ).first()
    
    if holding:
        if mapping.dollar_split:
            holding.mapping_status = MappingStatus.MULTI_ASSET
        else:
            holding.mapping_status = MappingStatus.MAPPED

    _clear_transition_results(db, prospect_id)
    db.commit()
    db.refresh(existing)
    return TickerMappingResponse.model_validate(existing)


@router.post("/{prospect_id}/force-sale")
async def mark_holding_forced_sale(
    prospect_id: UUID,
    body: ForceSaleRequest,
    db: Session = Depends(get_db)
):
    """Mark a holding as forced sale (don't map; it will be liquidated in the transition)."""
    prospect = db.query(Prospect).filter(Prospect.id == prospect_id).first()
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospect not found")
    holding = db.query(ProspectHolding).filter(
        ProspectHolding.prospect_id == prospect_id,
        ProspectHolding.ticker == body.legacy_ticker
    ).first()
    if not holding:
        raise HTTPException(status_code=404, detail="Holding not found")
    holding.mapping_status = MappingStatus.FORCED_SALE
    _clear_transition_results(db, prospect_id)
    db.commit()
    return {"message": "Holding marked as forced sale", "ticker": body.legacy_ticker}


@router.post("/{prospect_id}/calculate", response_model=TransitionResultResponse)
async def calculate_transition(
    prospect_id: UUID,
    db: Session = Depends(get_db)
):
    """Run transition calculation."""
    # Get prospect
    prospect = db.query(Prospect).filter(Prospect.id == prospect_id).first()
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospect not found")
    
    positions, display_strategy_name, version_for_result, versions_snapshot = _resolve_strategy_target(
        db, prospect
    )

    # Build prospect data: all non-forced-sale holdings (include side pocket so rebalance can report them pre/post)
    holdings_db = db.query(ProspectHolding).filter(
        ProspectHolding.prospect_id == prospect_id,
    ).all()

    forced_sale_db = [h for h in holdings_db if h.mapping_status == MappingStatus.FORCED_SALE]
    holdings_to_map_db = [h for h in holdings_db if h.mapping_status != MappingStatus.FORCED_SALE]

    holdings = [
        Holding(
            ticker=h.ticker,
            value=Decimal(str(h.value)),
            unrealized_gain_loss=Decimal(str(h.unrealized_gain_loss)),
            is_side_pocket=h.is_side_pocket,
        )
        for h in holdings_to_map_db
    ]
    forced_sale_holdings = [
        Holding(
            ticker=h.ticker,
            value=Decimal(str(h.value)),
            unrealized_gain_loss=Decimal(str(h.unrealized_gain_loss)),
            is_side_pocket=False
        )
        for h in forced_sale_db
    ]
    
    product_equivalents = _resolve_product_equivalents_dict(db, prospect)
    logger.info(
        "Prospect %s calculate target: %s",
        prospect_id,
        display_strategy_name,
    )

    # Get manual mappings
    manual_mappings_db = db.query(TickerMapping).filter(
        TickerMapping.prospect_id == prospect_id
    ).all()
    
    manual_mappings = {}
    for mm in manual_mappings_db:
        manual_mappings[mm.legacy_ticker] = {
            'model_ticker': mm.model_ticker,
            'grade': mm.grade,
            'dollar_split': mm.dollar_split
        }
    
    # Run rebalancing calculation (forced_sale_holdings are liquidated and proceeds used for buys)
    prospect_data = {
        'holdings': holdings,
        'total_value': Decimal(str(prospect.total_value)),
        'product_equivalents': product_equivalents,
        'manual_mappings': manual_mappings,
        'forced_sale_holdings': forced_sale_holdings,
    }
    
    strategy_data = {
        'positions': positions,
        'version': version_for_result
    }
    
    result = rebalance(prospect_data, strategy_data)
    
    blend = _blend_components_from_prospect(prospect)
    if blend:
        prospect.strategy_blend = components_with_versions(blend, versions_snapshot)

    # Save result to database
    db_result = TransitionResult(
        prospect_id=prospect_id,
        strategy_version=version_for_result,
        strategy_versions_snapshot=versions_snapshot,
        sell_orders=json.dumps([{
            'ticker': so.ticker,
            'value': float(so.value),
            'gain_loss': float(so.gain_loss),
            'grade': so.grade
        } for so in result.sell_orders]),
        buy_orders=json.dumps([{
            'model_ticker': bo.model_ticker,
            'value': float(bo.value),
            'asset_class': bo.asset_class.value
        } for bo in result.buy_orders]),
        cash_residual=result.cash_residual,
        total_realized_gain_loss=result.total_realized_gain_loss,
        pre_holdings=json.dumps([{
            'ticker': ph.ticker,
            'asset_class': ph.asset_class,
            'value': float(ph.value),
            'unrealized_gain_loss': float(getattr(ph, 'unrealized_gain_loss', 0.0)),
        } for ph in result.pre_holdings]),
        post_holdings=json.dumps([{
            'model_ticker': poh.model_ticker,
            'asset_class': poh.asset_class,
            'value': float(poh.value),
            'ticker': poh.ticker,
            'unrealized_gain_loss': float(getattr(poh, 'unrealized_gain_loss', 0.0)),
        } for poh in result.post_holdings]),
        equivalent_usage=result.equivalent_usage or [],
        target_positions=_target_positions_payload(positions),
    )
    db.add(db_result)
    db.commit()
    db.refresh(db_result)
    _, strategy_display_name = _resolve_target_positions_for_result(db, prospect, db_result)
    sell_orders_resp = _normalize_jsonb(db_result.sell_orders)
    buy_orders_resp = _normalize_jsonb(db_result.buy_orders)
    pre_holdings_resp = _normalize_jsonb(db_result.pre_holdings)
    post_holdings_resp = _normalize_jsonb(db_result.post_holdings)
    return TransitionResultResponse.model_validate({
        "id": db_result.id,
        "prospect_id": db_result.prospect_id,
        "strategy_version": db_result.strategy_version,
        "sell_orders": sell_orders_resp,
        "buy_orders": buy_orders_resp,
        "cash_residual": db_result.cash_residual,
        "total_realized_gain_loss": db_result.total_realized_gain_loss,
        "pre_holdings": pre_holdings_resp,
        "post_holdings": post_holdings_resp,
        "equivalent_usage": _normalize_jsonb(db_result.equivalent_usage),
        "target_positions": _normalize_jsonb(db_result.target_positions),
        "strategy_display_name": strategy_display_name,
        "created_at": db_result.created_at,
    })


@router.get("/{prospect_id}/result", response_model=TransitionResultResponse)
async def get_transition_result(
    prospect_id: UUID,
    db: Session = Depends(get_db)
):
    """Get transition result for a prospect."""
    result = db.query(TransitionResult).filter(
        TransitionResult.prospect_id == prospect_id
    ).order_by(TransitionResult.created_at.desc()).first()

    if not result:
        raise HTTPException(status_code=404, detail="Transition result not found")

    sell_orders = _normalize_jsonb(result.sell_orders)
    buy_orders = _normalize_jsonb(result.buy_orders)
    pre_holdings = _normalize_jsonb(result.pre_holdings)
    post_holdings = _normalize_jsonb(result.post_holdings)
    equivalent_usage = _normalize_jsonb(getattr(result, "equivalent_usage", None))
    pre_holdings, post_holdings = _hydrate_unrealized_for_saved_result(
        db=db,
        prospect_id=prospect_id,
        pre_holdings=pre_holdings,
        post_holdings=post_holdings,
        sell_orders=sell_orders,
    )

    prospect = db.query(Prospect).filter(Prospect.id == prospect_id).first()
    target_positions, strategy_display_name = _resolve_target_positions_for_result(
        db, prospect, result
    ) if prospect else ([], None)

    return TransitionResultResponse.model_validate({
        "id": result.id,
        "prospect_id": result.prospect_id,
        "strategy_version": result.strategy_version,
        "sell_orders": sell_orders,
        "buy_orders": buy_orders,
        "cash_residual": result.cash_residual,
        "total_realized_gain_loss": result.total_realized_gain_loss,
        "pre_holdings": pre_holdings,
        "post_holdings": post_holdings,
        "equivalent_usage": equivalent_usage,
        "target_positions": target_positions,
        "strategy_display_name": strategy_display_name,
        "created_at": result.created_at,
    })


def _normalize_jsonb(v):
    """Ensure JSONB field is a list of dicts."""
    if v is None:
        return []
    if isinstance(v, str):
        return json.loads(v) if v.strip() else []
    if isinstance(v, list):
        return [x for x in v if isinstance(x, dict)]
    return []


def _safe_pdf_filename(name: str) -> str:
    """ASCII-safe filename for Content-Disposition (avoid quotes/newlines breaking headers)."""
    base = re.sub(r"[^\w\s.-]+", "", (name or "report"), flags=re.ASCII)
    base = re.sub(r"\s+", "-", base.strip())[:40] or "report"
    return f"transition-report-{base}.pdf"


def _safe_float_json(v, default=0.0) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def _rows_have_unrealized(rows) -> bool:
    return any(isinstance(r, dict) and r.get("unrealized_gain_loss") is not None for r in (rows or []))


def _merge_post_cash_rows(post_rows: list) -> list:
    """Ensure proposed portfolio has one Cash row (legacy + residual merged)."""
    rows = [r for r in (post_rows or []) if isinstance(r, dict)]
    cash_rows = [r for r in rows if str(r.get("asset_class") or "").strip() == "Cash"]
    if len(cash_rows) <= 1:
        return rows

    non_cash = [r for r in rows if str(r.get("asset_class") or "").strip() != "Cash"]
    total_cash_value = sum(_safe_float_json(r.get("value")) for r in cash_rows)
    total_cash_unrealized = sum(_safe_float_json(r.get("unrealized_gain_loss")) for r in cash_rows)
    # Keep a stable identifier where possible.
    model_ticker = next((str(r.get("model_ticker")) for r in cash_rows if r.get("model_ticker")), "Cash")
    legacy_ticker = next((str(r.get("ticker")) for r in cash_rows if r.get("ticker")), None)
    merged = {
        "model_ticker": model_ticker,
        "asset_class": "Cash",
        "value": total_cash_value,
        "ticker": legacy_ticker,
        "unrealized_gain_loss": total_cash_unrealized,
    }
    non_cash.append(merged)
    return non_cash


def _hydrate_unrealized_for_saved_result(
    db: Session,
    prospect_id: UUID,
    pre_holdings: list,
    post_holdings: list,
    sell_orders: list,
):
    """
    Backfill unrealized_gain_loss for older saved results that predate unrealized fields.
    """
    pre_rows = list(pre_holdings or [])
    post_rows = list(post_holdings or [])
    if _rows_have_unrealized(pre_rows) and _rows_have_unrealized(post_rows):
        return pre_rows, _merge_post_cash_rows(post_rows)

    holdings_db = db.query(ProspectHolding).filter(ProspectHolding.prospect_id == prospect_id).all()
    ticker_unrealized = {}
    ticker_value = {}
    ticker_unrealized_side_pocket = {}
    ticker_value_side_pocket = {}
    ticker_unrealized_non_sp = {}
    ticker_value_non_sp = {}
    for h in holdings_db:
        t = h.ticker
        ticker_unrealized[t] = ticker_unrealized.get(t, 0.0) + _safe_float_json(h.unrealized_gain_loss)
        ticker_value[t] = ticker_value.get(t, 0.0) + _safe_float_json(h.value)
        if h.is_side_pocket:
            ticker_unrealized_side_pocket[t] = ticker_unrealized_side_pocket.get(t, 0.0) + _safe_float_json(h.unrealized_gain_loss)
            ticker_value_side_pocket[t] = ticker_value_side_pocket.get(t, 0.0) + _safe_float_json(h.value)
        else:
            ticker_unrealized_non_sp[t] = ticker_unrealized_non_sp.get(t, 0.0) + _safe_float_json(h.unrealized_gain_loss)
            ticker_value_non_sp[t] = ticker_value_non_sp.get(t, 0.0) + _safe_float_json(h.value)

    pre_row_value_by_bucket = {}
    for r in pre_rows:
        t = r.get("ticker")
        bucket = "sp" if str(r.get("asset_class") or "").strip() == "Side Pocket" else "non_sp"
        k = (t, bucket)
        pre_row_value_by_bucket[k] = pre_row_value_by_bucket.get(k, 0.0) + _safe_float_json(r.get("value"))
    for r in pre_rows:
        if r.get("unrealized_gain_loss") is not None:
            continue
        t = r.get("ticker")
        bucket = "sp" if str(r.get("asset_class") or "").strip() == "Side Pocket" else "non_sp"
        total_row_val = pre_row_value_by_bucket.get((t, bucket), 0.0)
        row_val = _safe_float_json(r.get("value"))
        if bucket == "sp":
            total_u = ticker_unrealized_side_pocket.get(t, 0.0)
        else:
            total_u = ticker_unrealized_non_sp.get(t, 0.0)
        r["unrealized_gain_loss"] = (total_u * row_val / total_row_val) if total_row_val > 0 else 0.0

    sold_by_ticker = {}
    for so in sell_orders or []:
        t = so.get("ticker")
        sold_by_ticker[t] = sold_by_ticker.get(t, 0.0) + _safe_float_json(so.get("value"))

    remaining_unrealized_by_ticker_non_sp = {}
    for t, pre_u in ticker_unrealized_non_sp.items():
        base_val = ticker_value_non_sp.get(t, 0.0)
        sold_val = sold_by_ticker.get(t, 0.0)
        keep_ratio = ((base_val - sold_val) / base_val) if base_val > 0 else 0.0
        if keep_ratio < 0:
            keep_ratio = 0.0
        remaining_unrealized_by_ticker_non_sp[t] = pre_u * keep_ratio

    post_legacy_row_value_by_bucket = {}
    for r in post_rows:
        legacy_ticker = r.get("ticker")
        if not legacy_ticker:
            continue
        bucket = "sp" if str(r.get("asset_class") or "").strip() == "Side Pocket" else "non_sp"
        k = (legacy_ticker, bucket)
        post_legacy_row_value_by_bucket[k] = post_legacy_row_value_by_bucket.get(k, 0.0) + _safe_float_json(r.get("value"))

    for r in post_rows:
        if r.get("unrealized_gain_loss") is not None:
            continue
        legacy_ticker = r.get("ticker")
        if not legacy_ticker:
            r["unrealized_gain_loss"] = 0.0
            continue
        bucket = "sp" if str(r.get("asset_class") or "").strip() == "Side Pocket" else "non_sp"
        total_row_val = post_legacy_row_value_by_bucket.get((legacy_ticker, bucket), 0.0)
        row_val = _safe_float_json(r.get("value"))
        if bucket == "sp":
            total_u = ticker_unrealized_side_pocket.get(legacy_ticker, 0.0)
        else:
            total_u = remaining_unrealized_by_ticker_non_sp.get(legacy_ticker, 0.0)
        r["unrealized_gain_loss"] = (total_u * row_val / total_row_val) if total_row_val > 0 else 0.0

    return pre_rows, _merge_post_cash_rows(post_rows)


@router.get("/{prospect_id}/report-pdf")
async def get_report_pdf(
    prospect_id: UUID,
    additional_text: str | None = None,
    db: Session = Depends(get_db)
):
    """Generate landscape PDF transition report for the prospect's latest result."""
    prospect = db.query(Prospect).filter(Prospect.id == prospect_id).first()
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospect not found")
    display_strategy_name = _prospect_display_strategy_name(db, prospect)
    if not display_strategy_name:
        raise HTTPException(status_code=404, detail="Strategy not found")
    result = db.query(TransitionResult).filter(
        TransitionResult.prospect_id == prospect_id
    ).order_by(TransitionResult.created_at.desc()).first()
    if not result:
        raise HTTPException(status_code=404, detail="Transition result not found. Run Calculate first.")

    target_positions, strategy_display_name = _resolve_target_positions_for_result(
        db, prospect, result
    )
    asset_class_order = _asset_class_order_from_positions(target_positions)

    sell_orders = _normalize_jsonb(result.sell_orders)
    buy_orders = _normalize_jsonb(result.buy_orders)
    pre_holdings = _normalize_jsonb(result.pre_holdings)
    post_holdings = _normalize_jsonb(result.post_holdings)
    equivalent_usage = _normalize_jsonb(getattr(result, "equivalent_usage", None))
    pre_holdings, post_holdings = _hydrate_unrealized_for_saved_result(
        db=db,
        prospect_id=prospect_id,
        pre_holdings=pre_holdings,
        post_holdings=post_holdings,
        sell_orders=sell_orders,
    )

    total_value = float(prospect.total_value)
    total_gains = sum(max(0, _safe_float_json(so.get("gain_loss"))) for so in sell_orders)
    total_losses = sum(min(0, _safe_float_json(so.get("gain_loss"))) for so in sell_orders)
    net_gain_loss = float(result.total_realized_gain_loss)
    cash_residual = float(result.cash_residual)

    pre_unrealized_gain_loss = sum(_safe_float_json(h.get("unrealized_gain_loss")) for h in pre_holdings)
    post_unrealized_gain_loss = sum(_safe_float_json(h.get("unrealized_gain_loss")) for h in post_holdings)
    normalized_additional_text = (additional_text or "").strip() if additional_text is not None else ""
    if normalized_additional_text:
        result.pdf_additional_text = normalized_additional_text
        db.add(result)
        db.commit()
        db.refresh(result)
    effective_additional_text = normalized_additional_text or (result.pdf_additional_text or None)

    try:
        pdf_bytes = build_transition_report_pdf(
            prospect_name=prospect.name,
            strategy_name=display_strategy_name or strategy_display_name,
            target_positions=target_positions,
            report_date=result.created_at.date() if result.created_at else None,
            total_value=total_value,
            total_gains=total_gains,
            total_losses=abs(total_losses),
            net_gain_loss=net_gain_loss,
            pre_unrealized_gain_loss=pre_unrealized_gain_loss,
            post_unrealized_gain_loss=post_unrealized_gain_loss,
            cash_residual=cash_residual,
            additional_text=effective_additional_text,
            pre_holdings=pre_holdings,
            post_holdings=post_holdings,
            sell_orders=sell_orders,
            buy_orders=buy_orders,
            equivalent_usage=equivalent_usage,
            asset_class_order=asset_class_order,
        )
    except Exception as e:
        logger.exception("PDF generation failed for prospect %s", prospect_id)
        raise HTTPException(
            status_code=500,
            detail=f"PDF generation failed: {e!s}",
        ) from e

    filename = _safe_pdf_filename(prospect.name)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{prospect_id}/stale-check")
async def check_stale_data(
    prospect_id: UUID,
    db: Session = Depends(get_db)
):
    """Check if strategy was updated since last calculation."""
    prospect = db.query(Prospect).filter(Prospect.id == prospect_id).first()
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospect not found")
    
    result = db.query(TransitionResult).filter(
        TransitionResult.prospect_id == prospect_id
    ).order_by(TransitionResult.created_at.desc()).first()
    
    if not result:
        return {"is_stale": False, "message": "No calculation found"}

    blend = _blend_components_from_prospect(prospect)
    stored_snapshot = getattr(result, "strategy_versions_snapshot", None) or {}
    if blend:
        is_stale = is_blend_stale(
            db, blend, stored_snapshot, result_strategy_version=result.strategy_version
        )
        current_versions = blend_version_snapshot(db, blend)
        return {
            "is_stale": is_stale,
            "current_strategy_version": max(current_versions.values()) if current_versions else None,
            "result_strategy_version": result.strategy_version,
            "message": "One or more blended strategies have been updated" if is_stale else "Data is current",
        }

    strategy = db.query(Strategy).filter(Strategy.id == prospect.strategy_id).first()
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")

    is_stale = strategy.version > result.strategy_version
    
    return {
        "is_stale": is_stale,
        "current_strategy_version": strategy.version,
        "result_strategy_version": result.strategy_version,
        "message": "Strategy has been updated" if is_stale else "Data is current"
    }
