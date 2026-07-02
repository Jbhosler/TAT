"""
Core rebalancing logic for Tax-Aware Transition Tool.
Pure Python module with no dependencies on API/UI layers.
All calculations use Decimal for 0.1% precision.
"""
from decimal import Decimal, ROUND_HALF_UP
from typing import List, Dict, Tuple, Optional, Any
from dataclasses import dataclass, field
from enum import Enum


# Precision constant: 0.1% = 0.001
PRECISION = Decimal('0.001')


class AssetClass(str, Enum):
    """Asset class enumeration."""
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
    # Fixed Income (legacy)
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
    CASH = "Cash"


@dataclass
class Holding:
    """Represents a single holding in a prospect portfolio."""
    ticker: str
    value: Decimal
    unrealized_gain_loss: Decimal
    is_side_pocket: bool = False


@dataclass
class MappedHolding:
    """Holding mapped to a model ticker with grade."""
    ticker: str
    value: Decimal
    unrealized_gain_loss: Decimal
    model_ticker: str
    asset_class: AssetClass
    grade: int  # 0, 1, or 2


@dataclass
class SellOrder:
    """Represents a sell order."""
    ticker: str
    value: Decimal
    gain_loss: Decimal
    grade: int
    quantity: Optional[Decimal] = None


@dataclass
class BuyOrder:
    """Represents a buy order."""
    model_ticker: str
    value: Decimal
    asset_class: AssetClass


@dataclass
class PreHolding:
    """Legacy holding for pre-trade display (ticker, asset class, value)."""
    ticker: str
    asset_class: str
    value: Decimal
    unrealized_gain_loss: Decimal = Decimal("0")


@dataclass
class PostHolding:
    """Proposed holding for post-trade display (model ticker, asset class, value; optional legacy ticker)."""
    model_ticker: str
    asset_class: str
    value: Decimal
    ticker: Optional[str] = None  # legacy ticker when position is kept from a mapped holding
    unrealized_gain_loss: Decimal = Decimal("0")


@dataclass
class TransitionResult:
    """Complete transition calculation result."""
    sell_orders: List[SellOrder]
    buy_orders: List[BuyOrder]
    cash_residual: Decimal
    total_realized_gain_loss: Decimal
    pre_holdings: List[PreHolding]
    post_holdings: List[PostHolding]
    # Unique legacy→model pairs used for mapped rebalanceable holdings; in_product_equivalents from GE_Alt
    equivalent_usage: List[Dict[str, Any]] = field(default_factory=list)


def round_to_precision(value: Decimal) -> Decimal:
    """Round to 0.1% precision (0.001). Accepts Decimal, int, or float (e.g. sum() of empty iterable returns int 0)."""
    if not isinstance(value, Decimal):
        value = Decimal(str(value))
    return value.quantize(PRECISION, rounding=ROUND_HALF_UP)


def normalize_ticker(ticker: str) -> str:
    """Canonical form for ticker matching: uppercase, stripped. Custodian exports
    and GE_Alt files don't always agree on case."""
    return (ticker or "").strip().upper()


def classify_holdings(holdings: List[Holding]) -> Tuple[List[Holding], List[Holding]]:
    """
    Classify holdings into side-pocket (individual stocks) and rebalanceable holdings.
    
    Heuristic: Individual stocks typically don't have standard fund suffixes.
    For now, we'll use a simple heuristic - holdings that are likely individual stocks
    will be identified by the asset classifier utility.
    
    Args:
        holdings: List of holdings to classify
        
    Returns:
        Tuple of (side_pocket_holdings, rebalanceable_holdings)
    """
    side_pocket = []
    rebalanceable = []
    
    for holding in holdings:
        if holding.is_side_pocket:
            side_pocket.append(holding)
        else:
            rebalanceable.append(holding)
    
    return side_pocket, rebalanceable


def build_equivalent_usage_rows(
    mapped_holdings: List[MappedHolding],
    product_equivalents: Dict[str, Dict[str, int]],
    manual_mappings: Optional[Dict[str, Dict[str, any]]] = None,
) -> List[Dict[str, Any]]:
    """
    One row per unique (legacy ticker, model ticker, grade) used for mapped rebalanceable holdings.

    in_product_equivalents: exact (legacy, model, grade) exists in GE_Alt for the strategy.
    mapping_source:
      - ge_alt: matched the strategy's GE_Alt file
      - manual: adviser set this mapping on the proposal (Option C)
      - cash: auto-mapped cash position (not a GE_Alt follow-up item)
      - not_in_ge_alt: used in the transition but not in GE_Alt (e.g. grade differs from file)
    """
    pe_normalized = {normalize_ticker(lt): pe_map for lt, pe_map in product_equivalents.items()}
    manual_normalized = {
        normalize_ticker(t): m for t, m in (manual_mappings or {}).items()
    }
    seen: set = set()
    rows: List[Dict[str, Any]] = []
    for mh in mapped_holdings:
        key = (mh.ticker, mh.model_ticker, mh.grade)
        if key in seen:
            continue
        seen.add(key)
        ticker_key = normalize_ticker(mh.ticker)
        in_pe = False
        pe_map = pe_normalized.get(ticker_key)
        if pe_map is not None:
            if mh.model_ticker in pe_map and pe_map[mh.model_ticker] == mh.grade:
                in_pe = True

        if mh.asset_class == AssetClass.CASH or ticker_key == "CASH":
            mapping_source = "cash"
        elif ticker_key in manual_normalized:
            mapping_source = "manual"
        elif in_pe:
            mapping_source = "ge_alt"
        else:
            mapping_source = "not_in_ge_alt"

        rows.append({
            "legacy_ticker": mh.ticker,
            "model_ticker": mh.model_ticker,
            "grade": mh.grade,
            "in_product_equivalents": in_pe,
            "mapping_source": mapping_source,
        })
    # Proposal-only rows first so reports surface action items at the top.
    _source_order = {"manual": 0, "not_in_ge_alt": 1, "cash": 2, "ge_alt": 3}
    rows.sort(
        key=lambda r: (
            _source_order.get(r["mapping_source"], 9),
            r["legacy_ticker"],
            r["model_ticker"],
            r["grade"],
        )
    )
    return rows


def map_holdings_to_model_tickers(
    holdings: List[Holding],
    product_equivalents: Dict[str, Dict[str, int]],  # {legacy_ticker: {model_ticker: grade}}
    manual_mappings: Dict[str, Dict[str, any]],  # {ticker: {model_ticker, grade, dollar_split}}
    strategy_positions: Dict[str, AssetClass]  # {model_ticker: asset_class}
) -> Tuple[List[MappedHolding], List[Holding]]:
    """
    Map holdings to model tickers using product equivalents, manual mappings, and multi-asset splits.
    
    Args:
        holdings: List of holdings to map
        product_equivalents: Dictionary mapping legacy tickers to model tickers and grades
        manual_mappings: Dictionary of manual mappings (Option C) - can override product equivalents
        strategy_positions: Dictionary mapping model tickers to asset classes
        
    Returns:
        Tuple of (mapped_holdings, unmapped_holdings)
    """
    mapped = []
    unmapped = []
    
    # Normalize legacy-ticker keys so matching is case/whitespace-insensitive
    # (custodian exports and GE_Alt files don't always agree on case).
    manual_normalized = {normalize_ticker(t): m for t, m in manual_mappings.items()}
    pe_normalized = {normalize_ticker(t): e for t, e in product_equivalents.items()}

    for holding in holdings:
        ticker_key = normalize_ticker(holding.ticker)
        # Check manual mappings first (Option C - highest priority)
        if ticker_key in manual_normalized:
            mapping = manual_normalized[ticker_key]
            
            # Check for multi-asset split
            if mapping.get('dollar_split'):
                # Split across multiple model tickers
                dollar_split = mapping['dollar_split']
                total_split = sum(Decimal(str(v)) for v in dollar_split.values())
                
                # Validate the entire split up front (value matches and every model
                # ticker exists in the strategy) so a partially-valid split never
                # ends up both mapped and unmapped (double-counting the holding).
                if (
                    holding.value == 0
                    or abs(total_split - holding.value) > Decimal('0.01')
                    or any(mt not in strategy_positions for mt in dollar_split)
                ):
                    unmapped.append(holding)
                    continue
                
                # Create mapped holdings for each split
                for model_ticker, split_value in dollar_split.items():
                    mapped.append(MappedHolding(
                        ticker=holding.ticker,
                        value=Decimal(str(split_value)),
                        unrealized_gain_loss=holding.unrealized_gain_loss * (Decimal(str(split_value)) / holding.value),
                        model_ticker=model_ticker,
                        asset_class=strategy_positions[model_ticker],
                        grade=mapping.get('grade', 2)
                    ))
            else:
                # Single model ticker mapping
                model_ticker = mapping.get('model_ticker')
                if model_ticker and model_ticker in strategy_positions:
                    mapped.append(MappedHolding(
                        ticker=holding.ticker,
                        value=holding.value,
                        unrealized_gain_loss=holding.unrealized_gain_loss,
                        model_ticker=model_ticker,
                        asset_class=strategy_positions[model_ticker],
                        grade=mapping.get('grade', 2)
                    ))
                else:
                    unmapped.append(holding)
        
        # Check product equivalents (GE_Alt.csv)
        elif ticker_key in pe_normalized:
            equiv = pe_normalized[ticker_key]
            # Use the first equivalent that exists in the strategy (insertion
            # order favors higher-weight strategies in blends).
            model_ticker = next(
                (mt for mt in equiv if mt in strategy_positions),
                None
            )
            
            if model_ticker:
                mapped.append(MappedHolding(
                    ticker=holding.ticker,
                    value=holding.value,
                    unrealized_gain_loss=holding.unrealized_gain_loss,
                    model_ticker=model_ticker,
                    asset_class=strategy_positions[model_ticker],
                    grade=equiv[model_ticker]
                ))
            else:
                unmapped.append(holding)
        
        # Cash: map CASH/Cash ticker to Cash asset class when strategy has Cash position
        elif ticker_key == "CASH":
            cash_model_ticker = next(
                (mt for mt, ac in strategy_positions.items() if ac == AssetClass.CASH),
                None
            )
            if cash_model_ticker:
                mapped.append(MappedHolding(
                    ticker=holding.ticker,
                    value=holding.value,
                    unrealized_gain_loss=holding.unrealized_gain_loss,
                    model_ticker=cash_model_ticker,
                    asset_class=AssetClass.CASH,
                    grade=0
                ))
            else:
                unmapped.append(holding)

        # Unmapped - needs user intervention
        else:
            unmapped.append(holding)
    
    return mapped, unmapped


def calculate_current_allocations(
    mapped_holdings: List[MappedHolding],
    total_value: Decimal
) -> Dict[AssetClass, Decimal]:
    """
    Calculate current allocation percentages by asset class.
    
    Args:
        mapped_holdings: List of mapped holdings
        total_value: Total portfolio value
        
    Returns:
        Dictionary mapping asset class to allocation percentage (0.1% precision)
    """
    if total_value == 0:
        return {}
    
    allocations = {}
    for holding in mapped_holdings:
        asset_class = holding.asset_class
        if asset_class not in allocations:
            allocations[asset_class] = Decimal('0')
        allocations[asset_class] += holding.value
    
    # Convert to percentages with 0.1% precision
    result = {}
    for asset_class, value in allocations.items():
        percentage = (value / total_value) * Decimal('100')
        result[asset_class] = round_to_precision(percentage)
    
    return result


def calculate_drift_deltas(
    current: Dict[AssetClass, Decimal],
    targets: Dict[AssetClass, Decimal],
    drifts: Dict[AssetClass, Decimal]
) -> Dict[AssetClass, Decimal]:
    """
    Calculate sell deltas for overweight asset classes.
    Trades move toward target: delta = current % - target %
    (Previously used drift tolerance: sold only to target + drift.)
    
    Args:
        current: Current allocation percentages
        targets: Target allocation percentages
        drifts: Drift percentages (unused; kept for API compatibility)
        
    Returns:
        Dictionary of overweight classes and their deltas (amount to sell)
    """
    deltas = {}
    
    for asset_class in current:
        current_pct = current.get(asset_class, Decimal('0'))
        target_pct = targets.get(asset_class, Decimal('0'))
        delta = current_pct - target_pct
        
        # Only include positive deltas (overweight: current > target)
        if delta > Decimal('0'):
            deltas[asset_class] = round_to_precision(delta)
    
    return deltas


def liquidate_waterfall(
    overweight_class: AssetClass,
    required_sell_value: Decimal,
    holdings: List[MappedHolding],
    total_value: Decimal,
    sold_by_holding: Optional[Dict[int, Decimal]] = None
) -> List[SellOrder]:
    """
    Liquidate holdings using the waterfall: Grade 2 → Grade 1 → Grade 0,
    then by Unrealized Gain (lowest to highest).
    
    Greedy elimination: Prefer 100% liquidation if position ≤ required amount.
    Sells the required value to move allocation toward target.
    
    Args:
        overweight_class: Asset class to liquidate
        required_sell_value: Total value to sell (in dollars)
        holdings: List of holdings in this asset class
        total_value: Total portfolio value
        sold_by_holding: Optional dict populated with sold value per holding,
            keyed by id(holding). Lets callers attribute sells to the exact
            holding instead of matching by ticker (which double-counts when
            the same ticker appears in multiple holdings).
        
    Returns:
        List of sell orders
    """
    # Filter holdings for this asset class
    class_holdings = [h for h in holdings if h.asset_class == overweight_class]
    
    if not class_holdings:
        return []
    
    # Sort by: Grade (descending: 2→1→0), then Unrealized Gain (ascending: lowest to highest)
    sorted_holdings = sorted(
        class_holdings,
        key=lambda h: (-h.grade, h.unrealized_gain_loss)
    )
    
    sell_orders = []
    remaining_to_sell = required_sell_value
    
    for holding in sorted_holdings:
        if remaining_to_sell <= 0:
            break
        
        # Greedy elimination: if position ≤ required, liquidate 100%
        if holding.value <= remaining_to_sell:
            # Liquidate entire position
            sell_value = holding.value
            sell_orders.append(SellOrder(
                ticker=holding.ticker,
                value=sell_value,
                gain_loss=holding.unrealized_gain_loss,
                grade=holding.grade
            ))
            remaining_to_sell -= sell_value
        else:
            # Partial liquidation
            sell_value = remaining_to_sell
            sell_orders.append(SellOrder(
                ticker=holding.ticker,
                value=sell_value,
                gain_loss=holding.unrealized_gain_loss * (sell_value / holding.value),
                grade=holding.grade
            ))
            remaining_to_sell = Decimal('0')
        if sold_by_holding is not None:
            sold_by_holding[id(holding)] = sold_by_holding.get(id(holding), Decimal('0')) + sell_value
    
    return sell_orders


def calculate_allocations_by_ticker(
    mapped_holdings: List[MappedHolding],
    total_value: Decimal,
) -> Dict[str, Decimal]:
    """Allocation percentage per model ticker (0.1% precision)."""
    if total_value == 0:
        return {}
    allocations: Dict[str, Decimal] = {}
    for holding in mapped_holdings:
        mt = holding.model_ticker
        allocations[mt] = allocations.get(mt, Decimal("0")) + holding.value
    return {
        mt: round_to_precision((value / total_value) * Decimal("100"))
        for mt, value in allocations.items()
    }


def calculate_buys_by_ticker(
    current_by_ticker: Dict[str, Decimal],
    remaining_value: Decimal,
    total_value: Decimal,
    targets_by_ticker: Dict[str, Decimal],
    strategy_positions: Dict[str, AssetClass],
) -> List[BuyOrder]:
    """Buy orders per model ticker to reach each ticker's target % of the full portfolio."""
    buy_orders: List[BuyOrder] = []
    for model_ticker, target_pct in targets_by_ticker.items():
        asset_class = strategy_positions[model_ticker]
        if asset_class == AssetClass.CASH:
            continue
        current_pct = current_by_ticker.get(model_ticker, Decimal("0"))
        current_value = (current_pct / Decimal("100")) * remaining_value
        target_value = (target_pct / Decimal("100")) * total_value
        buy_value = target_value - current_value
        if buy_value > Decimal("0"):
            buy_orders.append(BuyOrder(
                model_ticker=model_ticker,
                value=round_to_precision(buy_value),
                asset_class=asset_class,
            ))
    return buy_orders


def calculate_buys(
    underweight_classes: Dict[AssetClass, Decimal],
    remaining_value: Decimal,
    total_value: Decimal,
    targets: Dict[AssetClass, Decimal],
    model_tickers: Dict[AssetClass, str]  # {asset_class: model_ticker}
) -> List[BuyOrder]:
    """
    Calculate buy orders to bring underweight classes to Target % of full portfolio.
    Current positions are % of remaining_value (kept positions); targets are % of total_value.

    Args:
        underweight_classes: Underweight classes and their current % (of remaining_value)
        remaining_value: Value of kept positions after sells
        total_value: Full portfolio value (used for target dollar amounts)
        targets: Target allocation percentages
        model_tickers: Dictionary mapping asset classes to model tickers

    Returns:
        List of buy orders
    """
    buy_orders = []
    for asset_class, current_pct in underweight_classes.items():
        # Cash is held, not bought; reserve target amount via cash_residual
        if asset_class == AssetClass.CASH:
            continue
        target_pct = targets.get(asset_class, Decimal('0'))
        current_value = (current_pct / Decimal('100')) * remaining_value
        target_value = (target_pct / Decimal('100')) * total_value
        buy_value = target_value - current_value
        if buy_value > Decimal('0') and asset_class in model_tickers:
            buy_orders.append(BuyOrder(
                model_ticker=model_tickers[asset_class],
                value=round_to_precision(buy_value),
                asset_class=asset_class
            ))
    return buy_orders


def sweep_residuals(remaining_value: Decimal) -> Decimal:
    """
    Sweep any unallocated value into CASH asset class.
    
    Args:
        remaining_value: Unallocated value to sweep
        
    Returns:
        Cash residual value
    """
    return round_to_precision(remaining_value) if remaining_value > 0 else Decimal('0')


def rebalance(
    prospect_data: Dict,
    strategy: Dict
) -> TransitionResult:
    """
    Main orchestration function for rebalancing calculation.
    
    Args:
        prospect_data: Dictionary containing:
            - holdings: List[Holding]
            - total_value: Decimal
            - product_equivalents: Dict
            - manual_mappings: Dict
        strategy: Dictionary containing:
            - positions: List[dict] with model_ticker, asset_class, target_allocation, drift_percentage
            - version: int
            
    Returns:
        TransitionResult with sell_orders, buy_orders, cash_residual, total_realized_gain_loss
    """
    holdings = prospect_data['holdings']
    total_value = Decimal(str(prospect_data['total_value']))
    product_equivalents = prospect_data.get('product_equivalents', {})
    manual_mappings = prospect_data.get('manual_mappings', {})
    forced_sale_holdings = prospect_data.get('forced_sale_holdings', [])

    # Build strategy data structures (supports multiple model tickers per asset class)
    strategy_positions: Dict[str, AssetClass] = {}
    targets: Dict[AssetClass, Decimal] = {}
    targets_by_ticker: Dict[str, Decimal] = {}
    drifts: Dict[AssetClass, Decimal] = {}
    model_tickers: Dict[AssetClass, str] = {}  # representative ticker per class (e.g. cash)
    drift_weighted_sum: Dict[AssetClass, Decimal] = {}
    drift_target_sum: Dict[AssetClass, Decimal] = {}

    for pos in strategy['positions']:
        model_ticker = pos['model_ticker']
        asset_class = AssetClass(pos['asset_class'])
        target = round_to_precision(Decimal(str(pos['target_allocation'])))
        drift = Decimal(str(pos['drift_percentage']))

        strategy_positions[model_ticker] = asset_class
        targets_by_ticker[model_ticker] = target
        targets[asset_class] = targets.get(asset_class, Decimal("0")) + target
        drift_weighted_sum[asset_class] = drift_weighted_sum.get(asset_class, Decimal("0")) + (drift * target)
        drift_target_sum[asset_class] = drift_target_sum.get(asset_class, Decimal("0")) + target
        model_tickers[asset_class] = model_ticker

    for asset_class, weight_sum in drift_target_sum.items():
        if weight_sum > 0:
            drifts[asset_class] = round_to_precision(drift_weighted_sum[asset_class] / weight_sum)
    
    # Step 1: Classify holdings (side-pocket vs rebalanceable)
    side_pocket, rebalanceable = classify_holdings(holdings)
    
    # Step 2: Map holdings to model tickers
    mapped_holdings, unmapped_holdings = map_holdings_to_model_tickers(
        rebalanceable,
        product_equivalents,
        manual_mappings,
        strategy_positions
    )
    
    # If there are unmapped holdings, they need user intervention
    # For now, we'll proceed with mapped holdings only
    
    # Step 3: Calculate current allocations
    current_allocations = calculate_current_allocations(mapped_holdings, total_value)
    
    # Step 4: Calculate drift deltas (overweight classes)
    drift_deltas = calculate_drift_deltas(current_allocations, targets, drifts)
    
    # Step 5: Liquidate overweight classes (and forced-sale holdings first)
    all_sell_orders = []
    for h in forced_sale_holdings:
        all_sell_orders.append(SellOrder(
            ticker=h.ticker,
            value=h.value,
            gain_loss=h.unrealized_gain_loss,
            grade=2  # default for forced sale
        ))
    sold_by_holding: Dict[int, Decimal] = {}
    for asset_class, delta_pct in drift_deltas.items():
        # Convert percentage delta to dollar value
        required_sell_value = (delta_pct / Decimal('100')) * total_value
        sell_orders = liquidate_waterfall(
            asset_class,
            required_sell_value,
            mapped_holdings,
            total_value,
            sold_by_holding
        )
        all_sell_orders.extend(sell_orders)
    
    # Calculate total realized gain/loss from sells
    total_realized_gain_loss = sum(order.gain_loss for order in all_sell_orders)
    
    # Step 6: Calculate value after sells
    total_sold = sum(order.value for order in all_sell_orders)
    remaining_value = total_value - total_sold
    
    # Step 7: Calculate buys for underweight classes
    # Recalculate current allocations after sells.
    # Sells are attributed per holding (not by ticker) so the same ticker held
    # in multiple lots/splits is not double-subtracted.
    remaining_holdings = []
    for holding in mapped_holdings:
        sold = sold_by_holding.get(id(holding), Decimal('0'))
        if sold < holding.value:
            # Create adjusted holding
            remaining_holdings.append(MappedHolding(
                ticker=holding.ticker,
                value=holding.value - sold,
                unrealized_gain_loss=holding.unrealized_gain_loss * ((holding.value - sold) / holding.value),
                model_ticker=holding.model_ticker,
                asset_class=holding.asset_class,
                grade=holding.grade
            ))
    
    # Recalculate allocations after sells
    current_after_sells = calculate_current_allocations(remaining_holdings, remaining_value)
    
    # Calculate buys per model ticker (supports blended portfolios with VOO + IVV, etc.)
    current_after_sells_by_ticker = calculate_allocations_by_ticker(remaining_holdings, remaining_value)
    buy_orders = calculate_buys_by_ticker(
        current_after_sells_by_ticker,
        remaining_value,
        total_value,
        targets_by_ticker,
        strategy_positions,
    )
    total_bought = sum(order.value for order in buy_orders)
    # Max spend: proceeds from sells minus the cash still needed to reach target.
    # Kept positions may already include cash (sold down to target by the
    # waterfall when overweight), so only the shortfall is reserved here —
    # reserving the full target would under-fund the buys.
    target_cash_value = (targets.get(AssetClass.CASH, Decimal('0')) / Decimal('100')) * total_value
    kept_cash_value = sum(
        (h.value for h in remaining_holdings if h.asset_class == AssetClass.CASH),
        Decimal('0')
    )
    cash_shortfall = max(Decimal('0'), target_cash_value - kept_cash_value)
    max_spend = max(Decimal('0'), total_sold - cash_shortfall)
    # Scale down buy orders if we would overspend
    if total_bought > max_spend:
        scale = max_spend / total_bought if total_bought > 0 else Decimal('0')
        scaled = []
        for bo in buy_orders:
            scaled.append(BuyOrder(
                model_ticker=bo.model_ticker,
                value=round_to_precision(bo.value * scale),
                asset_class=bo.asset_class
            ))
        buy_orders = scaled

    # Build pre_holdings: mapped + forced sale + side pocket + unmapped (so pre total = full portfolio)
    pre_holdings: List[PreHolding] = []
    for h in mapped_holdings:
        pre_holdings.append(
            PreHolding(
                ticker=h.ticker,
                asset_class=h.asset_class.value,
                value=h.value,
                unrealized_gain_loss=h.unrealized_gain_loss,
            )
        )
    for h in forced_sale_holdings:
        pre_holdings.append(
            PreHolding(
                ticker=h.ticker,
                asset_class="Forced Sale",
                value=h.value,
                unrealized_gain_loss=h.unrealized_gain_loss,
            )
        )
    for h in side_pocket:
        pre_holdings.append(
            PreHolding(
                ticker=h.ticker,
                asset_class="Side Pocket",
                value=h.value,
                unrealized_gain_loss=h.unrealized_gain_loss,
            )
        )
    for h in unmapped_holdings:
        pre_holdings.append(
            PreHolding(
                ticker=h.ticker,
                asset_class="Unmapped",
                value=h.value,
                unrealized_gain_loss=h.unrealized_gain_loss,
            )
        )

    pre_total = sum(ph.value for ph in pre_holdings)

    # Build post_holdings: remaining (kept; include legacy ticker) + buy_orders + cash
    post_holdings: List[PostHolding] = []
    for h in remaining_holdings:
        post_holdings.append(
            PostHolding(
                model_ticker=h.model_ticker,
                asset_class=h.asset_class.value,
                value=h.value,
                ticker=h.ticker,
                unrealized_gain_loss=h.unrealized_gain_loss,
            )
        )
    for bo in buy_orders:
        post_holdings.append(
            PostHolding(
                model_ticker=bo.model_ticker,
                asset_class=bo.asset_class.value,
                value=bo.value,
                unrealized_gain_loss=Decimal("0"),
            )
        )
    # Side-pocket positions are unchanged (not transitioned); include in post-trade view
    for h in side_pocket:
        post_holdings.append(PostHolding(
            model_ticker=h.ticker,
            asset_class="Side Pocket",
            value=h.value,
            ticker=h.ticker,
            unrealized_gain_loss=h.unrealized_gain_loss,
        ))
    # Normalize cash so post total equals pre total (avoids rounding drift)
    post_sum_without_cash = sum(poh.value for poh in post_holdings)
    cash_value = max(Decimal('0'), pre_total - post_sum_without_cash)
    if cash_value > 0:
        cash_model_ticker = model_tickers.get(AssetClass.CASH, "Cash")
        post_holdings.append(
            PostHolding(
                model_ticker=cash_model_ticker,
                asset_class="Cash",
                value=cash_value,
                unrealized_gain_loss=Decimal("0"),
            )
        )

    # Consolidate all post-trade cash rows into a single line item so residual cash
    # augments existing cash instead of creating a duplicate cash holding.
    cash_rows = [h for h in post_holdings if h.asset_class == "Cash"]
    non_cash_rows = [h for h in post_holdings if h.asset_class != "Cash"]
    if cash_rows:
        total_cash_value = sum(h.value for h in cash_rows)
        total_cash_unrealized = sum(h.unrealized_gain_loss for h in cash_rows)
        first = cash_rows[0]
        merged_model_ticker = first.model_ticker
        merged_ticker = first.ticker
        for h in cash_rows:
            if h.model_ticker:
                merged_model_ticker = h.model_ticker
            if h.ticker:
                merged_ticker = h.ticker
                break
        non_cash_rows.append(PostHolding(
            model_ticker=merged_model_ticker,
            asset_class="Cash",
            value=total_cash_value,
            ticker=merged_ticker,
            unrealized_gain_loss=total_cash_unrealized,
        ))
        post_holdings = non_cash_rows
    cash_residual = cash_value  # keep API/DB in sync with post_holdings total

    equivalent_usage = build_equivalent_usage_rows(
        mapped_holdings, product_equivalents, manual_mappings
    )

    return TransitionResult(
        sell_orders=all_sell_orders,
        buy_orders=buy_orders,
        cash_residual=cash_residual,
        total_realized_gain_loss=round_to_precision(total_realized_gain_loss),
        pre_holdings=pre_holdings,
        post_holdings=post_holdings,
        equivalent_usage=equivalent_usage,
    )
