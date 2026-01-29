"""
Admin panel endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID
from backend.database.connection import get_db
from backend.api.models.database import (
    AssetClass, ProductEquivalent, Strategy
)
from backend.api.models.schemas import (
    ProductEquivalentCreate,
    ProductEquivalentResponse
)
from backend.utils.csv_parser import parse_product_equivalents_csv

router = APIRouter()


@router.get("/asset-classes")
async def list_asset_classes():
    """List all 9 asset classes."""
    return [ac.value for ac in AssetClass if ac != AssetClass.CASH]


@router.get("/product-equivalents/{strategy_id}", response_model=List[ProductEquivalentResponse])
async def get_product_equivalents(
    strategy_id: UUID,
    db: Session = Depends(get_db)
):
    """Get product equivalents (GE_Alt.csv data) for a strategy."""
    equivalents = db.query(ProductEquivalent).filter(
        ProductEquivalent.strategy_id == strategy_id
    ).all()
    return [ProductEquivalentResponse.model_validate(e) for e in equivalents]


@router.post("/product-equivalents/{strategy_id}")
async def upload_product_equivalents(
    strategy_id: UUID,
    csv_content: str,
    db: Session = Depends(get_db)
):
    """Upload GE_Alt.csv (Product Equivalents) for a strategy."""
    # Verify strategy exists
    strategy = db.query(Strategy).filter(Strategy.id == strategy_id).first()
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")
    
    try:
        equivalents_data = parse_product_equivalents_csv(csv_content)
        
        # Delete existing equivalents
        db.query(ProductEquivalent).filter(
            ProductEquivalent.strategy_id == strategy_id
        ).delete()
        
        # Add new equivalents
        for equiv_data in equivalents_data:
            db_equiv = ProductEquivalent(
                strategy_id=strategy_id,
                legacy_ticker=equiv_data['legacy_ticker'],
                model_ticker=equiv_data['model_ticker'],
                grade=equiv_data['grade']
            )
            db.add(db_equiv)
        
        db.commit()
        
        return {"message": "Product equivalents uploaded successfully", "count": len(equivalents_data)}
    
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
