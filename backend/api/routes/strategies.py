"""
Strategy CRUD endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload
from typing import List
from uuid import UUID
from backend.database.connection import get_db
from backend.api.models.database import Strategy, StrategyPosition
from backend.api.models.schemas import (
    StrategyCreate,
    StrategyResponse,
    StrategyPositionCreate,
    StrategyPositionResponse,
)
from backend.utils.csv_parser import parse_strategy_bulk_upload

router = APIRouter()


def _strategy_to_response(strategy: Strategy) -> StrategyResponse:
    """Build StrategyResponse from ORM while session is still open."""
    positions = [
        StrategyPositionResponse.model_validate(p)
        for p in strategy.positions
    ]
    return StrategyResponse(
        id=strategy.id,
        name=strategy.name,
        version=strategy.version,
        positions=positions,
        created_at=strategy.created_at,
        updated_at=strategy.updated_at,
    )


@router.get("", response_model=List[StrategyResponse])
async def list_strategies(db: Session = Depends(get_db)):
    """List all strategies with positions (eager load, then build response in-session)."""
    import logging
    logger = logging.getLogger(__name__)
    try:
        strategies = (
            db.query(Strategy)
            .options(selectinload(Strategy.positions))
            .all()
        )
        return [_strategy_to_response(s) for s in strategies]
    except Exception as e:
        logger.error(f"Error listing strategies: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.get("/{strategy_id}", response_model=StrategyResponse)
async def get_strategy(strategy_id: UUID, db: Session = Depends(get_db)):
    """Get a strategy with its positions."""
    strategy = (
        db.query(Strategy)
        .options(selectinload(Strategy.positions))
        .filter(Strategy.id == strategy_id)
        .first()
    )
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")
    return _strategy_to_response(strategy)


@router.post("", response_model=StrategyResponse)
async def create_strategy(strategy: StrategyCreate, db: Session = Depends(get_db)):
    """Create a new strategy."""
    import logging
    logger = logging.getLogger(__name__)
    try:
        db_strategy = Strategy(
            name=strategy.name,
            version=1
        )
        db.add(db_strategy)
        db.flush()

        # Create positions
        for pos in strategy.positions:
            db_position = StrategyPosition(
                strategy_id=db_strategy.id,
                model_ticker=pos.model_ticker,
                asset_class=pos.asset_class,
                target_allocation=pos.target_allocation,
                drift_percentage=pos.drift_percentage
            )
            db.add(db_position)

        db.commit()
        db.refresh(db_strategy)
        # Build response in-session so positions are loaded
        return _strategy_to_response(db_strategy)
    except Exception as e:
        logger.error(f"Error creating strategy: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.put("/{strategy_id}", response_model=StrategyResponse)
async def update_strategy(
    strategy_id: UUID,
    strategy: StrategyCreate,
    db: Session = Depends(get_db)
):
    """Update a strategy (increments version)."""
    import logging
    logger = logging.getLogger(__name__)
    db_strategy = (
        db.query(Strategy)
        .options(selectinload(Strategy.positions))
        .filter(Strategy.id == strategy_id)
        .first()
    )
    if not db_strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")

    try:
        # Update strategy
        db_strategy.name = strategy.name
        db_strategy.version += 1  # Increment version for stale detection

        # Delete old positions
        db.query(StrategyPosition).filter(StrategyPosition.strategy_id == strategy_id).delete()

        # Create new positions
        for pos in strategy.positions:
            db_position = StrategyPosition(
                strategy_id=db_strategy.id,
                model_ticker=pos.model_ticker,
                asset_class=pos.asset_class,
                target_allocation=pos.target_allocation,
                drift_percentage=pos.drift_percentage
            )
            db.add(db_position)

        db.commit()
        db.refresh(db_strategy)
        return _strategy_to_response(db_strategy)
    except Exception as e:
        logger.error(f"Error updating strategy: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.delete("/{strategy_id}")
async def delete_strategy(strategy_id: UUID, db: Session = Depends(get_db)):
    """Delete a strategy."""
    strategy = db.query(Strategy).filter(Strategy.id == strategy_id).first()
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")
    
    db.delete(strategy)
    db.commit()
    return {"message": "Strategy deleted successfully"}


@router.post("/{strategy_id}/bulk-upload")
async def bulk_upload_strategy(
    strategy_id: UUID,
    csv_content: str,
    db: Session = Depends(get_db)
):
    """
    Bulk upload strategy positions from CSV.
    CSV format: Strategy Name, Model Ticker, Asset Class, Target %, Drift %
    """
    try:
        strategies_data = parse_strategy_bulk_upload(csv_content)
        
        # Find the strategy
        db_strategy = db.query(Strategy).filter(Strategy.id == strategy_id).first()
        if not db_strategy:
            raise HTTPException(status_code=404, detail="Strategy not found")
        
        # Delete old positions
        db.query(StrategyPosition).filter(StrategyPosition.strategy_id == strategy_id).delete()
        
        # Add new positions from CSV
        for strategy_data in strategies_data:
            if strategy_data['name'] == db_strategy.name:
                for pos in strategy_data['positions']:
                    db_position = StrategyPosition(
                        strategy_id=db_strategy.id,
                        model_ticker=pos['model_ticker'],
                        asset_class=pos['asset_class'],
                        target_allocation=pos['target_allocation'],
                        drift_percentage=pos['drift_percentage']
                    )
                    db.add(db_position)
        
        db_strategy.version += 1  # Increment version
        db.commit()
        
        return {"message": "Strategy updated successfully", "version": db_strategy.version}
    
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
