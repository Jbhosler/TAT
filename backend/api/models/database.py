"""
SQLAlchemy database models for the Tax-Aware Transition Tool.
"""
from sqlalchemy import Column, String, Integer, Numeric, Boolean, ForeignKey, DateTime, JSON, Enum as SQLEnum, LargeBinary
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
import enum


class AssetClass(str, enum.Enum):
    """Asset class enumeration - 9 allowed classes."""
    US_LARGE_CORE = "US Large Core"
    US_LARGE_GROWTH = "US Large Growth"
    US_LARGE_VALUE = "US Large Value"
    US_MIDCAP_GROWTH = "US Midcap Growth"
    US_MIDCAP_VALUE = "US Midcap Value"
    US_SMALL_CAP = "US Small Cap"
    INTERNATIONAL_DEVELOPED = "International Developed"
    EMERGING_MARKETS = "Emerging Markets"
    FIXED_INCOME = "Fixed Income"
    CASH = "CASH"  # For residuals


class MappingStatus(str, enum.Enum):
    """Mapping status for prospect holdings."""
    MAPPED = "mapped"
    UNMAPPED = "unmapped"
    MULTI_ASSET = "multi_asset"
    FORCED_SALE = "forced_sale"  # User chose not to map; holding is liquidated (forced sale)


class BaseModel:
    """Base model with common fields."""
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


from sqlalchemy.ext.declarative import declarative_base
Base = declarative_base(cls=BaseModel)


class Strategy(Base):
    """Strategy model - represents an investment strategy."""
    __tablename__ = "strategies"
    
    name = Column(String(255), nullable=False)
    version = Column(Integer, default=1, nullable=False)  # Increments on update for stale detection
    
    # Relationships
    positions = relationship("StrategyPosition", back_populates="strategy", cascade="all, delete-orphan")
    product_equivalents = relationship("ProductEquivalent", back_populates="strategy", cascade="all, delete-orphan")
    prospects = relationship("Prospect", back_populates="strategy")


class StrategyPosition(Base):
    """Model ticker positions within a strategy."""
    __tablename__ = "strategy_positions"

    strategy_id = Column(UUID(as_uuid=True), ForeignKey("strategies.id"), nullable=False)
    model_ticker = Column(String(50), nullable=False)  # e.g., "SPYM"
    # Use enum value ("US Large Core") not name ("US_LARGE_CORE") to match PostgreSQL enum
    asset_class = Column(
        SQLEnum(AssetClass, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    target_allocation = Column(Numeric(6, 3), nullable=False)  # 0.1% precision, allow 0-100.000%
    drift_percentage = Column(Numeric(6, 3), nullable=False)  # 0.1% precision, allow 0-100.000%
    
    # Relationships
    strategy = relationship("Strategy", back_populates="positions")
    # No FK from product_equivalents to strategy_positions; link by (strategy_id, model_ticker)
    product_equivalents = relationship(
        "ProductEquivalent",
        primaryjoin="and_(ProductEquivalent.strategy_id==StrategyPosition.strategy_id, "
                    "ProductEquivalent.model_ticker==StrategyPosition.model_ticker)",
        foreign_keys="[ProductEquivalent.strategy_id, ProductEquivalent.model_ticker]",
        back_populates="model_ticker_position",
        viewonly=True,
    )


class ProductEquivalent(Base):
    """Product equivalents (GE_Alt.csv data) - maps legacy tickers to model tickers with grades."""
    __tablename__ = "product_equivalents"
    
    strategy_id = Column(UUID(as_uuid=True), ForeignKey("strategies.id"), nullable=False)
    legacy_ticker = Column(String(50), nullable=False)
    model_ticker = Column(String(50), nullable=False)  # References StrategyPosition.model_ticker
    grade = Column(Integer, nullable=False)  # 0, 1, or 2
    
    # Relationships
    strategy = relationship("Strategy", back_populates="product_equivalents")
    model_ticker_position = relationship(
        "StrategyPosition",
        primaryjoin="and_(ProductEquivalent.strategy_id==StrategyPosition.strategy_id, "
                   "ProductEquivalent.model_ticker==StrategyPosition.model_ticker)",
        foreign_keys=[strategy_id, model_ticker],
        viewonly=True
    )


class Prospect(Base):
    """Prospect model - represents a client portfolio to be transitioned."""
    __tablename__ = "prospects"
    
    strategy_id = Column(UUID(as_uuid=True), ForeignKey("strategies.id"), nullable=False)
    name = Column(String(255), nullable=False)
    total_value = Column(Numeric(15, 2), nullable=False)
    document_pdf = Column(LargeBinary, nullable=True)
    document_filename = Column(String(255), nullable=True)
    
    # Relationships
    strategy = relationship("Strategy", back_populates="prospects")
    holdings = relationship("ProspectHolding", back_populates="prospect", cascade="all, delete-orphan")
    ticker_mappings = relationship("TickerMapping", back_populates="prospect", cascade="all, delete-orphan")
    transition_results = relationship("TransitionResult", back_populates="prospect", cascade="all, delete-orphan")


class ProspectHolding(Base):
    """Individual holdings within a prospect portfolio."""
    __tablename__ = "prospect_holdings"
    
    prospect_id = Column(UUID(as_uuid=True), ForeignKey("prospects.id"), nullable=False)
    ticker = Column(String(50), nullable=False)
    value = Column(Numeric(15, 2), nullable=False)
    unrealized_gain_loss = Column(Numeric(15, 2), nullable=False)
    is_side_pocket = Column(Boolean, default=False, nullable=False)  # Individual stocks
    mapping_status = Column(
        SQLEnum(MappingStatus, values_callable=lambda x: [e.value for e in x]),
        default=MappingStatus.UNMAPPED,
        nullable=False,
    )
    
    # Relationships
    prospect = relationship("Prospect", back_populates="holdings")


class TickerMapping(Base):
    """Manual ticker mappings (Option C) - user-defined mappings for unmapped holdings."""
    __tablename__ = "ticker_mappings"
    
    prospect_id = Column(UUID(as_uuid=True), ForeignKey("prospects.id"), nullable=False)
    legacy_ticker = Column(String(50), nullable=False)
    model_ticker = Column(String(50), nullable=False)
    grade = Column(Integer, nullable=False)  # 0, 1, or 2
    dollar_split = Column(JSONB, nullable=True)  # For multi-asset: {ticker1: amount1, ticker2: amount2}
    
    # Relationships
    prospect = relationship("Prospect", back_populates="ticker_mappings")


class TransitionResult(Base):
    """Results of a transition calculation."""
    __tablename__ = "transition_results"
    
    prospect_id = Column(UUID(as_uuid=True), ForeignKey("prospects.id"), nullable=False)
    strategy_version = Column(Integer, nullable=False)  # Snapshot of strategy version at calculation time
    sell_orders = Column(JSONB, nullable=False)  # [{ticker, quantity, value, gain_loss, grade}]
    buy_orders = Column(JSONB, nullable=False)  # [{model_ticker, value, asset_class}]
    cash_residual = Column(Numeric(15, 2), nullable=False)
    total_realized_gain_loss = Column(Numeric(15, 2), nullable=False)
    pre_holdings = Column(JSONB, nullable=True)   # [{ticker, asset_class, value}] legacy by asset class
    post_holdings = Column(JSONB, nullable=True)  # [{model_ticker, asset_class, value}] proposed by asset class
    
    # Relationships
    prospect = relationship("Prospect", back_populates="transition_results")
