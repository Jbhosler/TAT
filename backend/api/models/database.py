"""
SQLAlchemy database models for the Tax-Aware Transition Tool.
"""
from sqlalchemy import Column, String, Integer, Numeric, Boolean, ForeignKey, DateTime, Date, JSON, Enum as SQLEnum, LargeBinary, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship, foreign
from sqlalchemy.sql import func
import uuid
import enum


class AssetClass(str, enum.Enum):
    """Asset class enumeration - equity, fixed income, and cash."""
    # Equity
    US_LARGE_CORE = "US Large Core"
    US_LARGE_GROWTH = "US Large Growth"
    US_LARGE_VALUE = "US Large Value"
    US_MIDCAP_GROWTH = "US Midcap Growth"
    US_MIDCAP_VALUE = "US Midcap Value"
    US_SMALL_CAP = "US Small Cap"
    INTERNATIONAL_DEVELOPED = "International Developed"
    EMERGING_MARKETS = "Emerging Markets"
    INFRASTRUCTURE = "Infrastructure"
    OPTIONS_OVERLAY = "Options Overlay"
    REAL_ESTATE = "Real Estate"
    # Fixed Income (legacy - kept for backwards compatibility)
    FIXED_INCOME = "Fixed Income"
    # Fixed Income subclasses
    EMG_BOND_LC = "Emg Bond LC"
    EMG_BOND_HEDGED = "Emg Bond Hedged"
    ST_CORP = "ST Corp"
    IT_CORP = "IT Corp"
    LT_CORP = "LT Corp"
    ST_GOVT = "ST Govt"
    IT_GOVT = "IT Govt"
    LT_GOVT = "LT Govt"
    TACTICAL_CASH = "Tactical Cash"
    ULTRA_ST_BOND = "Ultra ST Bond"
    AGGREGATE = "Aggregate"
    MORTGAGE_BACKED = "Mortgage Backed"
    INFLATION_PROTECTION = "Inflation Protection"
    ST_HIGH_YIELD = "ST High Yield"
    HIGH_YIELD = "High Yield"
    PRIVATE_CREDIT = "Private Credit"
    INTERNATIONAL_BOND = "International Bond"
    BANK_LOAN = "Bank Loan"
    SECURITIZED = "Securitized"
    VARIABLE_RATE_IG = "Variable Rate IG"
    MBS_FLOATING_RATE = "MBS Floating Rate"
    CLO_AAA = "CLO-AAA"
    CLO_BBB = "CLO-BBB"
    CLO_A = "CLO-A"
    COMMERCIAL_PAPER = "Commercial Paper"
    # Cash
    CASH = "Cash"  # For residuals


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
    strategy_name_mappings = relationship("StrategyNameMapping", back_populates="strategy", cascade="all, delete-orphan")
    monitored_accounts = relationship("MonitoredAccount", back_populates="strategy", cascade="all, delete-orphan")


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


class EquivalentMetrics(Base):
    """Snapshot of ticker characteristics for equivalent review (returns, volatility, drawdown, correlation)."""
    __tablename__ = "equivalent_metrics"

    equivalent_id = Column(UUID(as_uuid=True), ForeignKey("product_equivalents.id", ondelete="CASCADE"), nullable=False)
    last_updated = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    leg_ret_1y = Column(Numeric(10, 4), nullable=True)
    leg_ret_3y = Column(Numeric(10, 4), nullable=True)
    leg_ret_5y = Column(Numeric(10, 4), nullable=True)
    leg_vol = Column(Numeric(10, 4), nullable=True)
    leg_mdd = Column(Numeric(10, 4), nullable=True)
    mod_ret_1y = Column(Numeric(10, 4), nullable=True)
    mod_ret_3y = Column(Numeric(10, 4), nullable=True)
    mod_ret_5y = Column(Numeric(10, 4), nullable=True)
    mod_vol = Column(Numeric(10, 4), nullable=True)
    mod_mdd = Column(Numeric(10, 4), nullable=True)
    correlation_1y = Column(Numeric(10, 4), nullable=True)

    product_equivalent = relationship("ProductEquivalent", back_populates="equivalent_metrics")


class ProductEquivalent(Base):
    """Product equivalents - maps legacy tickers to model tickers with grades, buy/sell controls."""
    __tablename__ = "product_equivalents"
    
    strategy_id = Column(UUID(as_uuid=True), ForeignKey("strategies.id"), nullable=False)
    legacy_ticker = Column(String(50), nullable=False)
    model_ticker = Column(String(50), nullable=False)  # References StrategyPosition.model_ticker
    grade = Column(Integer, nullable=True)  # 0, 1, or 2; NULL = needs grade in app
    buy_control = Column(String(100), nullable=True)  # e.g. "Do not buy", "If held"
    sell_control = Column(String(100), nullable=True)  # e.g. "Do not sell", "Proportion ALL"
    custodian = Column(String(100), nullable=True)  # e.g. "ALL"
    notes = Column(String(500), nullable=True)
    description = Column(String(500), nullable=True)
    
    # Relationships
    strategy = relationship("Strategy", back_populates="product_equivalents")
    equivalent_metrics = relationship("EquivalentMetrics", back_populates="product_equivalent", uselist=False, cascade="all, delete-orphan")
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
    strategy_blend = Column(JSONB, nullable=True)  # [{strategy_id, weight, version?}]
    strategy_account_links = Column(JSONB, nullable=True)  # [{strategy_id, monitored_account_id}]
    name = Column(String(255), nullable=False)
    total_value = Column(Numeric(15, 2), nullable=False)
    classification_completed = Column(Boolean, default=False, nullable=False)
    document_pdf = Column(LargeBinary, nullable=True)
    document_filename = Column(String(255), nullable=True)
    monitored_account_id = Column(UUID(as_uuid=True), ForeignKey("monitored_accounts.id", ondelete="SET NULL"), nullable=True)
    
    # Relationships
    strategy = relationship("Strategy", back_populates="prospects")
    monitored_account = relationship("MonitoredAccount", back_populates="linked_prospects", foreign_keys=[monitored_account_id])
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
    strategy_versions_snapshot = Column(JSONB, nullable=True)  # strategy_id -> version at calculation
    target_positions = Column(JSONB, nullable=True)  # [{model_ticker, asset_class, target_allocation, drift_percentage}]
    sell_orders = Column(JSONB, nullable=False)  # [{ticker, quantity, value, gain_loss, grade}]
    buy_orders = Column(JSONB, nullable=False)  # [{model_ticker, value, asset_class}]
    cash_residual = Column(Numeric(15, 2), nullable=False)
    total_realized_gain_loss = Column(Numeric(15, 2), nullable=False)
    pre_holdings = Column(JSONB, nullable=True)   # [{ticker, asset_class, value}] legacy by asset class
    post_holdings = Column(JSONB, nullable=True)  # [{model_ticker, asset_class, value}] proposed by asset class
    equivalent_usage = Column(JSONB, nullable=True)  # [{legacy_ticker, model_ticker, grade, in_product_equivalents}]
    pdf_additional_text = Column(Text, nullable=True)  # Optional user-provided narrative stored with scenario result

    # Relationships
    prospect = relationship("Prospect", back_populates="transition_results")


class StrategyNameMapping(Base):
    """Maps external vendor model names to internal strategy IDs (Strategy Bridge)."""
    __tablename__ = "strategy_name_mappings"

    external_model_name = Column(String(255), nullable=False, unique=True)
    internal_strategy_id = Column(UUID(as_uuid=True), ForeignKey("strategies.id"), nullable=False)

    strategy = relationship("Strategy", back_populates="strategy_name_mappings")


class DiscoveryModel(Base):
    """Bridge between vendor model names and internal strategies. Tracks all models seen in ingest; internal_strategy_id is null until mapped."""
    __tablename__ = "discovery_models"

    external_model_name = Column(String(255), nullable=False, unique=True)
    internal_strategy_id = Column(UUID(as_uuid=True), ForeignKey("strategies.id"), nullable=True)
    last_seen = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
    is_active = Column(Boolean, nullable=False, default=True)

    strategy = relationship("Strategy", backref="discovery_models")


class MonitoredAccount(Base):
    """One row per synthetic account (Monitoring module)."""
    __tablename__ = "monitored_accounts"

    synthetic_id = Column(String(64), nullable=False, unique=True)
    friendly_name = Column(String(255), nullable=True)
    internal_strategy_id = Column(UUID(as_uuid=True), ForeignKey("strategies.id"), nullable=True)  # Null for unmapped models
    external_model_name = Column(String(255), nullable=True)  # Vendor model name (for discovery reporting)
    firm = Column(String(255), nullable=True)
    advisor = Column(String(255), nullable=True)
    advisor_crd = Column(String(32), nullable=True)  # FINRA CRD from registration-type upload
    account_display = Column(String(255), nullable=True)  # Partial/masked account (e.g. ****5038)
    registration_type = Column(String(50), nullable=True)  # Retirement, Taxable, Trust

    strategy = relationship("Strategy", back_populates="monitored_accounts")
    snapshots = relationship("AccountSnapshot", back_populates="monitored_account", cascade="all, delete-orphan")
    linked_prospects = relationship("Prospect", back_populates="monitored_account", foreign_keys="Prospect.monitored_account_id")


class AccountSnapshot(Base):
    """One snapshot per (MonitoredAccount, as_of_date)."""
    __tablename__ = "account_snapshots"
    __table_args__ = (UniqueConstraint("monitored_account_id", "as_of_date", name="uq_account_snapshot_account_date"),)

    monitored_account_id = Column(UUID(as_uuid=True), ForeignKey("monitored_accounts.id"), nullable=False)
    as_of_date = Column(Date, nullable=False)
    total_value = Column(Numeric(15, 2), nullable=False)
    total_deviation_score = Column(Numeric(10, 3), nullable=False)
    purity_score = Column(Numeric(5, 2), nullable=False)
    cash_pct = Column(Numeric(5, 2), nullable=True)  # Cash as % of account value
    is_unmapped = Column(Boolean, nullable=False, default=False)  # True when account has no strategy mapping

    monitored_account = relationship("MonitoredAccount", back_populates="snapshots")
    holdings = relationship("AccountSnapshotHolding", back_populates="account_snapshot", cascade="all, delete-orphan")


class AccountSnapshotHolding(Base):
    """Individual holding within an account snapshot."""
    __tablename__ = "account_snapshot_holdings"

    account_snapshot_id = Column(UUID(as_uuid=True), ForeignKey("account_snapshots.id"), nullable=False)
    ticker = Column(String(50), nullable=False)
    asset_class = Column(String(100), nullable=True)
    value = Column(Numeric(15, 2), nullable=False)
    weight_pct = Column(Numeric(6, 3), nullable=True)
    grade = Column(Integer, nullable=True)

    account_snapshot = relationship("AccountSnapshot", back_populates="holdings")


class MonitoringIngestRun(Base):
    """One row per successful aggregated holdings ingest; used to skip duplicate files and expose last_ingest_at."""
    __tablename__ = "monitoring_ingest_runs"

    ingested_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    ingested_count = Column(Integer, nullable=False, default=0)
    as_of_date = Column(Date, nullable=True)
    file_checksum = Column(String(64), nullable=False)


class AuthorizedUser(Base):
    """Authorized user allowed to access the app."""
    __tablename__ = "authorized_users"

    email = Column(String(255), nullable=False, unique=True, index=True)
    display_name = Column(String(255), nullable=True)
    role = Column(String(50), nullable=False, default="user")  # user | admin | super_admin
    is_active = Column(Boolean, nullable=False, default=True)
    added_by = Column(String(255), nullable=True)

    magic_link_tokens = relationship(
        "MagicLinkToken",
        back_populates="authorized_user",
        cascade="all, delete-orphan",
        primaryjoin="foreign(MagicLinkToken.email) == AuthorizedUser.email",
    )


class MagicLinkToken(Base):
    """Single-use magic link token (stored as hash)."""
    __tablename__ = "magic_link_tokens"

    email = Column(String(255), nullable=False, index=True)
    token_hash = Column(String(128), nullable=False, unique=True, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used_at = Column(DateTime(timezone=True), nullable=True)

    authorized_user = relationship(
        "AuthorizedUser",
        back_populates="magic_link_tokens",
        primaryjoin="foreign(MagicLinkToken.email) == AuthorizedUser.email",
        viewonly=True,
    )
