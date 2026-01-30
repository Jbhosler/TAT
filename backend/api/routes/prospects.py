"""
Prospect transition endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException, Request, File, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID
from decimal import Decimal
from backend.database.connection import get_db
from backend.api.models.database import (
    Prospect, ProspectHolding, ProductEquivalent, TickerMapping, TransitionResult,
    MappingStatus, Strategy
)
from backend.api.models.schemas import (
    ProspectCreate,
    ProspectResponse,
    ProspectHoldingResponse,
    ProspectListItem,
    ProspectSummary,
    TickerMappingCreate,
    TickerMappingResponse,
    ForceSaleRequest,
    TransitionResultResponse
)
from backend.utils.csv_parser import parse_prospect_csv
from backend.utils.asset_classifier import classify_holdings_as_side_pocket
from backend.logic.rebalancer import (
    Holding, MappedHolding, rebalance, classify_holdings
)
import json

router = APIRouter()


@router.get("", response_model=List[ProspectListItem])
async def list_prospects(db: Session = Depends(get_db)):
    """List all saved prospect scenarios (name, strategy, total value, created, has result)."""
    prospects = db.query(Prospect).order_by(Prospect.created_at.desc()).all()
    result_ids = {
        r[0] for r in db.query(TransitionResult.prospect_id).distinct().all()
    }
    out = []
    for p in prospects:
        strategy = db.query(Strategy).filter(Strategy.id == p.strategy_id).first()
        out.append(ProspectListItem(
            id=p.id,
            name=p.name,
            strategy_id=p.strategy_id,
            strategy_name=strategy.name if strategy else None,
            total_value=p.total_value,
            created_at=p.created_at,
            has_result=p.id in result_ids,
            has_document=p.document_pdf is not None,
        ))
    return out


@router.get("/{prospect_id}", response_model=ProspectSummary)
async def get_prospect_summary(
    prospect_id: UUID,
    db: Session = Depends(get_db)
):
    """Get minimal prospect info (e.g. for result page - has_document)."""
    prospect = db.query(Prospect).filter(Prospect.id == prospect_id).first()
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospect not found")
    return ProspectSummary(
        id=prospect.id,
        name=prospect.name,
        has_document=prospect.document_pdf is not None,
    )


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


def _prospect_to_response(prospect: Prospect) -> ProspectResponse:
    """Build ProspectResponse from ORM while session is still open."""
    holdings_resp = [ProspectHoldingResponse.model_validate(h) for h in prospect.holdings]
    return ProspectResponse(
        id=prospect.id,
        strategy_id=prospect.strategy_id,
        name=prospect.name,
        total_value=prospect.total_value,
        holdings=holdings_resp,
        created_at=prospect.created_at,
        updated_at=prospect.updated_at,
    )


@router.post("/upload", response_model=ProspectResponse)
async def upload_prospect(
    request: Request,
    strategy_id: UUID,
    name: str,
    db: Session = Depends(get_db)
):
    """Upload prospect CSV and create prospect. Accepts raw CSV body (text/csv or text/plain)."""
    # Read raw body so we accept text/csv (FastAPI would otherwise expect JSON and return 422)
    body = await request.body()
    csv_content = body.decode("utf-8-sig").strip()

    try:
        holdings_data = parse_prospect_csv(csv_content)

        # Calculate total value
        total_value = sum(Decimal(str(h['value'])) for h in holdings_data)

        # Create prospect
        db_prospect = Prospect(
            strategy_id=strategy_id,
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
        return _prospect_to_response(db_prospect)

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{prospect_id}/classify")
async def classify_prospect_holdings(
    prospect_id: UUID,
    db: Session = Depends(get_db)
):
    """Classify holdings (identify side-pocket individual stocks)."""
    prospect = db.query(Prospect).filter(Prospect.id == prospect_id).first()
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospect not found")
    
    holdings = db.query(ProspectHolding).filter(
        ProspectHolding.prospect_id == prospect_id
    ).all()
    
    # Classify holdings
    from backend.utils.asset_classifier import is_likely_fund
    
    side_pocket_count = 0
    for holding in holdings:
        is_fund = is_likely_fund(holding.ticker)
        holding.is_side_pocket = not is_fund
        if not is_fund:
            side_pocket_count += 1
    
    db.commit()
    
    return {
        "message": "Holdings classified",
        "side_pocket_count": side_pocket_count,
        "rebalanceable_count": len(holdings) - side_pocket_count
    }


@router.get("/{prospect_id}/unmapped", response_model=List[ProspectHoldingResponse])
async def get_unmapped_holdings(
    prospect_id: UUID,
    db: Session = Depends(get_db)
):
    """Get holdings that need manual mapping. Excludes holdings that already have a product equivalent (GE_Alt.csv) for this strategy."""
    prospect = db.query(Prospect).filter(Prospect.id == prospect_id).first()
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospect not found")

    # Holdings with mapping_status UNMAPPED and not side pocket
    holdings = db.query(ProspectHolding).filter(
        ProspectHolding.prospect_id == prospect_id,
        ProspectHolding.mapping_status == MappingStatus.UNMAPPED,
        ProspectHolding.is_side_pocket == False
    ).all()

    # Strategy's product equivalents (GE_Alt.csv) - these don't need manual mapping
    equivalents = db.query(ProductEquivalent).filter(
        ProductEquivalent.strategy_id == prospect.strategy_id
    ).all()
    tickers_with_equivalent = {pe.legacy_ticker for pe in equivalents}

    # Return only holdings that have no product equivalent (truly need user mapping)
    need_mapping = [h for h in holdings if h.ticker not in tickers_with_equivalent]
    return [ProspectHoldingResponse.model_validate(h) for h in need_mapping]


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
    
    # Get strategy
    from backend.api.models.database import Strategy, StrategyPosition, ProductEquivalent
    strategy = db.query(Strategy).filter(Strategy.id == prospect.strategy_id).first()
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")
    
    # Build prospect data: rebalanceable holdings only (exclude FORCED_SALE; those are sold separately)
    holdings_db = db.query(ProspectHolding).filter(
        ProspectHolding.prospect_id == prospect_id,
        ProspectHolding.is_side_pocket == False
    ).all()

    forced_sale_db = [h for h in holdings_db if h.mapping_status == MappingStatus.FORCED_SALE]
    holdings_to_map_db = [h for h in holdings_db if h.mapping_status != MappingStatus.FORCED_SALE]

    holdings = [
        Holding(
            ticker=h.ticker,
            value=Decimal(str(h.value)),
            unrealized_gain_loss=Decimal(str(h.unrealized_gain_loss)),
            is_side_pocket=h.is_side_pocket
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
    
    # Get product equivalents
    product_equivalents_db = db.query(ProductEquivalent).filter(
        ProductEquivalent.strategy_id == strategy.id
    ).all()
    
    product_equivalents = {}
    for pe in product_equivalents_db:
        if pe.legacy_ticker not in product_equivalents:
            product_equivalents[pe.legacy_ticker] = {}
        product_equivalents[pe.legacy_ticker][pe.model_ticker] = pe.grade
    
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
    
    # Build strategy data
    positions_db = db.query(StrategyPosition).filter(
        StrategyPosition.strategy_id == strategy.id
    ).all()
    
    positions = []
    for pos in positions_db:
        positions.append({
            'model_ticker': pos.model_ticker,
            'asset_class': pos.asset_class.value,
            'target_allocation': float(pos.target_allocation),
            'drift_percentage': float(pos.drift_percentage)
        })
    
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
        'version': strategy.version
    }
    
    result = rebalance(prospect_data, strategy_data)
    
    # Save result to database
    db_result = TransitionResult(
        prospect_id=prospect_id,
        strategy_version=strategy.version,
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
            'value': float(ph.value)
        } for ph in result.pre_holdings]),
        post_holdings=json.dumps([{
            'model_ticker': poh.model_ticker,
            'asset_class': poh.asset_class,
            'value': float(poh.value),
            'ticker': poh.ticker
        } for poh in result.post_holdings])
    )
    db.add(db_result)
    db.commit()
    db.refresh(db_result)
    # Build response in-session (JSONB fields are already loaded)
    return TransitionResultResponse.model_validate(db_result)


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

    return TransitionResultResponse.model_validate(result)


@router.get("/{prospect_id}/stale-check")
async def check_stale_data(
    prospect_id: UUID,
    db: Session = Depends(get_db)
):
    """Check if strategy was updated since last calculation."""
    prospect = db.query(Prospect).filter(Prospect.id == prospect_id).first()
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospect not found")
    
    from backend.api.models.database import Strategy
    strategy = db.query(Strategy).filter(Strategy.id == prospect.strategy_id).first()
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")
    
    result = db.query(TransitionResult).filter(
        TransitionResult.prospect_id == prospect_id
    ).order_by(TransitionResult.created_at.desc()).first()
    
    if not result:
        return {"is_stale": False, "message": "No calculation found"}
    
    is_stale = strategy.version > result.strategy_version
    
    return {
        "is_stale": is_stale,
        "current_strategy_version": strategy.version,
        "result_strategy_version": result.strategy_version,
        "message": "Strategy has been updated" if is_stale else "Data is current"
    }
