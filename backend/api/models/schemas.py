"""
Pydantic schemas for API request/response validation.
"""
import json
from pydantic import BaseModel, Field, validator, field_validator, ConfigDict
from typing import List, Optional, Dict, Any
from decimal import Decimal
from datetime import datetime
from uuid import UUID
from backend.api.models.database import AssetClass, MappingStatus


# Strategy Schemas
class StrategyPositionCreate(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    model_ticker: str = Field(..., max_length=50)
    asset_class: AssetClass
    target_allocation: Decimal = Field(..., ge=0, le=100)
    drift_percentage: Decimal = Field(..., ge=0, le=100)
    
    @validator('target_allocation', 'drift_percentage')
    def validate_precision(cls, v):
        """Ensure 0.1% precision."""
        # Round to 0.1% (0.001)
        return round(v, 3)


class StrategyCreate(BaseModel):
    name: str = Field(..., max_length=255)
    positions: List[StrategyPositionCreate]

    @validator('positions')
    def validate_positions(cls, v):
        """At least one position; target allocations must sum to 100% (0.1% tolerance)."""
        if not v or len(v) == 0:
            raise ValueError('Strategy must have at least one position')
        total = sum(p.target_allocation for p in v)
        if not (Decimal('99.999') <= total <= Decimal('100.001')):
            raise ValueError(
                f'Target allocations must sum to 100%. Current total: {float(total):.3f}%'
            )
        return v


class StrategyPositionResponse(BaseModel):
    """Response schema for strategy position (ORM-safe)."""
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())
    id: UUID
    strategy_id: UUID
    model_ticker: str
    asset_class: AssetClass
    target_allocation: Decimal
    drift_percentage: Decimal
    created_at: datetime
    updated_at: datetime


class StrategyResponse(BaseModel):
    id: UUID
    name: str
    version: int
    positions: List[StrategyPositionResponse]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Product Equivalent Schemas
class ProductEquivalentCreate(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    legacy_ticker: str = Field(..., max_length=50)
    model_ticker: str = Field(..., max_length=50)
    grade: int = Field(..., ge=0, le=2)


class ProductEquivalentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())
    id: UUID
    strategy_id: UUID
    legacy_ticker: str
    model_ticker: str
    grade: int
    created_at: datetime
    updated_at: datetime


# Prospect Schemas
class ProspectHoldingCreate(BaseModel):
    ticker: str = Field(..., max_length=50)
    value: Decimal = Field(..., gt=0)
    unrealized_gain_loss: Decimal


class ProspectCreate(BaseModel):
    strategy_id: UUID
    name: str = Field(..., max_length=255)
    holdings: List[ProspectHoldingCreate]


class ProspectHoldingResponse(BaseModel):
    id: UUID
    ticker: str
    value: Decimal
    unrealized_gain_loss: Decimal
    is_side_pocket: bool
    mapping_status: MappingStatus
    
    class Config:
        from_attributes = True


class ProspectResponse(BaseModel):
    id: UUID
    strategy_id: UUID
    name: str
    total_value: Decimal
    holdings: List[ProspectHoldingResponse]
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class ProspectListItem(BaseModel):
    """Summary of a prospect for the scenarios list."""
    id: UUID
    name: str
    strategy_id: UUID
    strategy_name: Optional[str] = None
    total_value: Decimal
    created_at: datetime
    has_result: bool = False
    has_document: bool = False


class ProspectSummary(BaseModel):
    """Minimal prospect info (e.g. for result page)."""
    id: UUID
    name: str
    has_document: bool = False


# Ticker Mapping Schemas (Option C)
class TickerMappingCreate(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    legacy_ticker: str = Field(..., max_length=50)
    model_ticker: str = Field(..., max_length=50)
    grade: int = Field(..., ge=0, le=2)
    dollar_split: Optional[Dict[str, Decimal]] = None  # For multi-asset splits


class TickerMappingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())
    id: UUID
    prospect_id: UUID
    legacy_ticker: str
    model_ticker: str
    grade: int
    dollar_split: Optional[Dict[str, Decimal]]
    created_at: datetime


class ForceSaleRequest(BaseModel):
    """Mark a holding as forced sale (don't map; liquidate)."""
    legacy_ticker: str = Field(..., max_length=50)


# Transition Result Schemas
class SellOrder(BaseModel):
    ticker: str
    quantity: Optional[Decimal] = None
    value: Decimal
    gain_loss: Decimal
    grade: int


class BuyOrder(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    model_ticker: str
    value: Decimal
    asset_class: AssetClass


class PreHolding(BaseModel):
    """Legacy holding for pre-trade display (ticker, asset class, value)."""
    model_config = ConfigDict(protected_namespaces=())
    ticker: str
    asset_class: str
    value: Decimal


class PostHolding(BaseModel):
    """Proposed holding for post-trade display (model ticker, asset class, value; optional legacy ticker)."""
    model_config = ConfigDict(protected_namespaces=())
    model_ticker: str
    asset_class: str
    value: Decimal
    ticker: Optional[str] = None  # legacy ticker when position is kept from a mapped holding


class TransitionResultResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    prospect_id: UUID
    strategy_version: int
    sell_orders: List[SellOrder]
    buy_orders: List[BuyOrder]
    cash_residual: Decimal
    total_realized_gain_loss: Decimal
    pre_holdings: Optional[List[PreHolding]] = None
    post_holdings: Optional[List[PostHolding]] = None
    created_at: datetime

    @field_validator("sell_orders", "buy_orders", "pre_holdings", "post_holdings", mode="before")
    @classmethod
    def parse_jsonb_list(cls, v: Any) -> Any:
        """Parse JSONB columns that come back as JSON strings from the DB (e.g. pg8000)."""
        if isinstance(v, str):
            return json.loads(v)
        return v


# CSV Upload Schemas
class BulkStrategyUpload(BaseModel):
    """Schema for bulk strategy CSV upload."""
    model_config = ConfigDict(protected_namespaces=())
    strategy_name: str
    model_ticker: str
    asset_class: AssetClass
    target_allocation: Decimal
    drift_percentage: Decimal


class ProspectCSVRow(BaseModel):
    """Schema for prospect CSV row."""
    ticker: str
    value: Decimal
    unrealized_gain_loss: Decimal


class ProductEquivalentCSVRow(BaseModel):
    """Schema for GE_Alt.csv row."""
    model_config = ConfigDict(protected_namespaces=())
    legacy_ticker: str
    model_ticker: str
    grade: int = Field(..., ge=0, le=2)
