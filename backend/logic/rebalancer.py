"""
Core rebalancing logic for Tax-Aware Transition Tool.
Pure Python module with no dependencies on API/UI layers.
All calculations use Decimal for 0.1% precision.
"""
from decimal import Decimal, ROUND_HALF_UP
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass
from enum import Enum


# Precision constant: 0.1% = 0.001
PRECISION = Decimal('0.001')


class AssetClass(str, Enum):
    """Asset class enumeration."""
    US_LARGE_CORE = "US Large Core"
    US_LARGE_GROWTH = "US Large Growth"
    US_LARGE_VALUE = "US Large Value"
    US_MIDCAP_GROWTH = "US Midcap Growth"
    US_MIDCAP_VALUE = "US Midcap Value"
    US_SMALL_CAP = "US Small Cap"
    INTERNATIONAL_DEVELOPED = "International Developed"
    EMERGING_MARKETS = "Emerging Markets"
    FIXED_INCOME = "Fixed Income"
    CASH = "CASH"


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


@dataclass
class PostHolding:
    """Proposed holding for post-trade display (model ticker, asset class, value; optional legacy ticker)."""
    model_ticker: str
    asset_class: str
    value: Decimal
    ticker: Optional[str] = None  # legacy ticker when position is kept from a mapped holding


@dataclass
class TransitionResult:
    """Complete transition calculation result."""
    sell_orders: List[SellOrder]
    buy_orders: List[BuyOrder]
    cash_residual: Decimal
    total_realized_gain_loss: Decimal
    pre_holdings: List[PreHolding]
    post_holdings: List[PostHolding]


def round_to_precision(value: Decimal) -> Decimal:
    """Round to 0.1% precision (0.001). Accepts Decimal, int, or float (e.g. sum() of empty iterable returns int 0)."""
    if not isinstance(value, Decimal):
        value = Decimal(str(value))
    return value.quantize(PRECISION, rounding=ROUND_HALF_UP)


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
    
    for holding in holdings:
        # Check manual mappings first (Option C - highest priority)
        if holding.ticker in manual_mappings:
            mapping = manual_mappings[holding.ticker]
            
            # Check for multi-asset split
            if mapping.get('dollar_split'):
                # Split across multiple model tickers
                dollar_split = mapping['dollar_split']
                total_split = sum(Decimal(str(v)) for v in dollar_split.values())
                
                # Validate split equals holding value
                if abs(total_split - holding.value) > Decimal('0.01'):
                    unmapped.append(holding)
                    continue
                
                # Create mapped holdings for each split
                for model_ticker, split_value in dollar_split.items():
                    if model_ticker in strategy_positions:
                        mapped.append(MappedHolding(
                            ticker=holding.ticker,
                            value=Decimal(str(split_value)),
                            unrealized_gain_loss=holding.unrealized_gain_loss * (Decimal(str(split_value)) / holding.value),
                            model_ticker=model_ticker,
                            asset_class=strategy_positions[model_ticker],
                            grade=mapping.get('grade', 2)
                        ))
                    else:
                        unmapped.append(holding)
                        break
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
        elif holding.ticker in product_equivalents:
            equiv = product_equivalents[holding.ticker]
            # Get first model ticker (assuming one-to-one for now)
            model_ticker = list(equiv.keys())[0] if equiv else None
            grade = equiv[model_ticker] if model_ticker and model_ticker in equiv else 2
            
            if model_ticker and model_ticker in strategy_positions:
                mapped.append(MappedHolding(
                    ticker=holding.ticker,
                    value=holding.value,
                    unrealized_gain_loss=holding.unrealized_gain_loss,
                    model_ticker=model_ticker,
                    asset_class=strategy_positions[model_ticker],
                    grade=grade
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
    Calculate drift deltas for overweight asset classes.
    Delta = current % - (target % + drift %)
    Only returns positive deltas (overweight classes).
    
    Args:
        current: Current allocation percentages
        targets: Target allocation percentages
        drifts: Drift percentages
        
    Returns:
        Dictionary of overweight classes and their deltas
    """
    deltas = {}
    
    for asset_class in current:
        current_pct = current.get(asset_class, Decimal('0'))
        target_pct = targets.get(asset_class, Decimal('0'))
        drift_pct = drifts.get(asset_class, Decimal('0'))
        
        upper_drift_limit = target_pct + drift_pct
        delta = current_pct - upper_drift_limit
        
        # Only include positive deltas (overweight)
        if delta > Decimal('0'):
            deltas[asset_class] = round_to_precision(delta)
    
    return deltas


def liquidate_waterfall(
    overweight_class: AssetClass,
    required_sell_value: Decimal,
    holdings: List[MappedHolding],
    total_value: Decimal
) -> List[SellOrder]:
    """
    Liquidate holdings using the waterfall: Grade 2 → Grade 1 → Grade 0,
    then by Unrealized Gain (lowest to highest).
    
    Greedy elimination: Prefer 100% liquidation if position ≤ required amount.
    Sell until Upper Drift Limit is reached.
    
    Args:
        overweight_class: Asset class to liquidate
        required_sell_value: Total value to sell (in dollars)
        holdings: List of holdings in this asset class
        total_value: Total portfolio value
        
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
            sell_orders.append(SellOrder(
                ticker=holding.ticker,
                value=holding.value,
                gain_loss=holding.unrealized_gain_loss,
                grade=holding.grade
            ))
            remaining_to_sell -= holding.value
        else:
            # Partial liquidation
            sell_orders.append(SellOrder(
                ticker=holding.ticker,
                value=remaining_to_sell,
                gain_loss=holding.unrealized_gain_loss * (remaining_to_sell / holding.value),
                grade=holding.grade
            ))
            remaining_to_sell = Decimal('0')
    
    return sell_orders


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

    # Build strategy data structures
    strategy_positions = {}
    targets = {}
    drifts = {}
    model_tickers = {}  # {asset_class: model_ticker}
    
    for pos in strategy['positions']:
        model_ticker = pos['model_ticker']
        asset_class = AssetClass(pos['asset_class'])
        target = Decimal(str(pos['target_allocation']))
        drift = Decimal(str(pos['drift_percentage']))
        
        strategy_positions[model_ticker] = asset_class
        targets[asset_class] = round_to_precision(target)
        drifts[asset_class] = round_to_precision(drift)
        model_tickers[asset_class] = model_ticker
    
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
    for asset_class, delta_pct in drift_deltas.items():
        # Convert percentage delta to dollar value
        required_sell_value = (delta_pct / Decimal('100')) * total_value
        sell_orders = liquidate_waterfall(
            asset_class,
            required_sell_value,
            mapped_holdings,
            total_value
        )
        all_sell_orders.extend(sell_orders)
    
    # Calculate total realized gain/loss from sells
    total_realized_gain_loss = sum(order.gain_loss for order in all_sell_orders)
    
    # Step 6: Calculate value after sells
    total_sold = sum(order.value for order in all_sell_orders)
    remaining_value = total_value - total_sold
    
    # Step 7: Calculate buys for underweight classes
    # Recalculate current allocations after sells
    remaining_holdings = []
    for holding in mapped_holdings:
        # Subtract sold amounts
        sold_for_ticker = sum(
            order.value for order in all_sell_orders 
            if order.ticker == holding.ticker
        )
        if sold_for_ticker < holding.value:
            # Create adjusted holding
            remaining_holdings.append(MappedHolding(
                ticker=holding.ticker,
                value=holding.value - sold_for_ticker,
                unrealized_gain_loss=holding.unrealized_gain_loss * ((holding.value - sold_for_ticker) / holding.value),
                model_ticker=holding.model_ticker,
                asset_class=holding.asset_class,
                grade=holding.grade
            ))
    
    # Recalculate allocations after sells
    current_after_sells = calculate_current_allocations(remaining_holdings, remaining_value)
    
    # Find underweight classes (current < target)
    underweight = {}
    for asset_class in targets:
        current_pct = current_after_sells.get(asset_class, Decimal('0'))
        target_pct = targets[asset_class]
        if current_pct < target_pct:
            underweight[asset_class] = current_pct
    
    # Calculate buys (targets as % of full portfolio; current as % of kept positions)
    buy_orders = calculate_buys(underweight, remaining_value, total_value, targets, model_tickers)
    total_bought = sum(order.value for order in buy_orders)
    # Cash available = proceeds from sells; we can only spend up to that
    if total_bought > total_sold:
        # Scale down buy orders so we don't overspend
        scale = total_sold / total_bought if total_bought > 0 else Decimal('0')
        scaled = []
        for bo in buy_orders:
            scaled.append(BuyOrder(
                model_ticker=bo.model_ticker,
                value=round_to_precision(bo.value * scale),
                asset_class=bo.asset_class
            ))
        buy_orders = scaled
        total_bought = sum(order.value for order in buy_orders)
    # Cash residual = proceeds from sells minus what we spent on buys
    cash_residual = max(Decimal('0'), total_sold - total_bought)
    cash_residual = sweep_residuals(cash_residual)

    # Build pre_holdings: mapped + forced sale + side pocket + unmapped (so pre total = full portfolio)
    pre_holdings: List[PreHolding] = []
    for h in mapped_holdings:
        pre_holdings.append(PreHolding(ticker=h.ticker, asset_class=h.asset_class.value, value=h.value))
    for h in forced_sale_holdings:
        pre_holdings.append(PreHolding(ticker=h.ticker, asset_class="Forced Sale", value=h.value))
    for h in side_pocket:
        pre_holdings.append(PreHolding(ticker=h.ticker, asset_class="Side Pocket", value=h.value))
    for h in unmapped_holdings:
        pre_holdings.append(PreHolding(ticker=h.ticker, asset_class="Unmapped", value=h.value))

    pre_total = sum(ph.value for ph in pre_holdings)

    # Build post_holdings: remaining (kept; include legacy ticker) + buy_orders + cash
    post_holdings: List[PostHolding] = []
    for h in remaining_holdings:
        post_holdings.append(PostHolding(model_ticker=h.model_ticker, asset_class=h.asset_class.value, value=h.value, ticker=h.ticker))
    for bo in buy_orders:
        post_holdings.append(PostHolding(model_ticker=bo.model_ticker, asset_class=bo.asset_class.value, value=bo.value))
    # Normalize cash so post total equals pre total (avoids rounding drift)
    post_sum_without_cash = sum(poh.value for poh in post_holdings)
    cash_value = max(Decimal('0'), pre_total - post_sum_without_cash)
    if cash_value > 0:
        post_holdings.append(PostHolding(model_ticker="Cash", asset_class="Cash", value=cash_value))
    cash_residual = cash_value  # keep API/DB in sync with post_holdings total

    return TransitionResult(
        sell_orders=all_sell_orders,
        buy_orders=buy_orders,
        cash_residual=cash_residual,
        total_realized_gain_loss=round_to_precision(total_realized_gain_loss),
        pre_holdings=pre_holdings,
        post_holdings=post_holdings
    )
