"""
Prospect transition endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID
from decimal import Decimal
from backend.database.connection import get_db
from backend.api.models.database import (
    Prospect, ProspectHolding, TickerMapping, TransitionResult,
    MappingStatus
)
from backend.api.models.schemas import (
    ProspectCreate,
    ProspectResponse,
    ProspectHoldingResponse,
    TickerMappingCreate,
    TickerMappingResponse,
    TransitionResultResponse
)
from backend.utils.csv_parser import parse_prospect_csv
from backend.utils.asset_classifier import classify_holdings_as_side_pocket
from backend.logic.rebalancer import (
    Holding, MappedHolding, rebalance, classify_holdings
)
import json

router = APIRouter()


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
    strategy_id: UUID,
    name: str,
    csv_content: str,
    db: Session = Depends(get_db)
):
    """Upload prospect CSV and create prospect."""
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
    """Get unmapped holdings that need user intervention."""
    holdings = db.query(ProspectHolding).filter(
        ProspectHolding.prospect_id == prospect_id,
        ProspectHolding.mapping_status == MappingStatus.UNMAPPED,
        ProspectHolding.is_side_pocket == False
    ).all()
    return [ProspectHoldingResponse.model_validate(h) for h in holdings]


@router.post("/{prospect_id}/map", response_model=TickerMappingResponse)
async def save_manual_mapping(
    prospect_id: UUID,
    mapping: TickerMappingCreate,
    db: Session = Depends(get_db)
):
    """Save manual ticker mapping (Option C)."""
    # Check if mapping already exists
    existing = db.query(TickerMapping).filter(
        TickerMapping.prospect_id == prospect_id,
        TickerMapping.legacy_ticker == mapping.legacy_ticker
    ).first()
    
    if existing:
        # Update existing mapping
        existing.model_ticker = mapping.model_ticker
        existing.grade = mapping.grade
        existing.dollar_split = mapping.dollar_split
    else:
        # Create new mapping
        existing = TickerMapping(
            prospect_id=prospect_id,
            legacy_ticker=mapping.legacy_ticker,
            model_ticker=mapping.model_ticker,
            grade=mapping.grade,
            dollar_split=mapping.dollar_split
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
    
    # Build prospect data
    holdings_db = db.query(ProspectHolding).filter(
        ProspectHolding.prospect_id == prospect_id,
        ProspectHolding.is_side_pocket == False
    ).all()
    
    holdings = [
        Holding(
            ticker=h.ticker,
            value=Decimal(str(h.value)),
            unrealized_gain_loss=Decimal(str(h.unrealized_gain_loss)),
            is_side_pocket=h.is_side_pocket
        )
        for h in holdings_db
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
    
    # Run rebalancing calculation
    prospect_data = {
        'holdings': holdings,
        'total_value': Decimal(str(prospect.total_value)),
        'product_equivalents': product_equivalents,
        'manual_mappings': manual_mappings
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
        total_realized_gain_loss=result.total_realized_gain_loss
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
