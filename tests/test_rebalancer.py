"""
Unit tests for core rebalancing logic.
"""
import pytest
from decimal import Decimal
from backend.logic.rebalancer import (
    Holding, MappedHolding, AssetClass, rebalance,
    classify_holdings, calculate_drift_deltas, calculate_buys,
    liquidate_waterfall, round_to_precision
)


def test_round_to_precision():
    """Test 0.1% precision rounding."""
    assert round_to_precision(Decimal('30.1234')) == Decimal('30.123')
    assert round_to_precision(Decimal('30.1236')) == Decimal('30.124')
    assert round_to_precision(Decimal('30.000')) == Decimal('30.000')


def test_classify_holdings():
    """Test holding classification."""
    holdings = [
        Holding(ticker="AAPL", value=Decimal('100000'), unrealized_gain_loss=Decimal('20000'), is_side_pocket=True),
        Holding(ticker="SPYM", value=Decimal('200000'), unrealized_gain_loss=Decimal('-5000'), is_side_pocket=False),
    ]
    
    side_pocket, rebalanceable = classify_holdings(holdings)
    
    assert len(side_pocket) == 1
    assert len(rebalanceable) == 1
    assert side_pocket[0].ticker == "AAPL"
    assert rebalanceable[0].ticker == "SPYM"


def test_grade_2_sold_before_grade_1():
    """
    Test: Grade 2 positions are liquidated before Grade 1, regardless of tax impact.
    """
    # Setup: Asset class overweight, has both Grade 2 and Grade 1 holdings
    holdings = [
        MappedHolding(
            ticker="LEGACY1",
            value=Decimal('50000'),
            unrealized_gain_loss=Decimal('-10000'),  # Large loss (would prefer to sell)
            model_ticker="SPYM",
            asset_class=AssetClass.US_LARGE_CORE,
            grade=1  # Grade 1
        ),
        MappedHolding(
            ticker="LEGACY2",
            value=Decimal('50000'),
            unrealized_gain_loss=Decimal('20000'),  # Large gain (would prefer not to sell)
            model_ticker="SPYM",
            asset_class=AssetClass.US_LARGE_CORE,
            grade=2  # Grade 2
        ),
    ]
    
    # Liquidate $60,000 worth (should sell Grade 2 first, then Grade 1)
    sell_orders = liquidate_waterfall(
        AssetClass.US_LARGE_CORE,
        Decimal('60000'),
        holdings,
        Decimal('100000')
    )
    
    # Verify: Grade 2 position liquidated first
    assert len(sell_orders) == 2
    assert sell_orders[0].ticker == "LEGACY2"  # Grade 2 first
    assert sell_orders[0].grade == 2
    assert sell_orders[1].ticker == "LEGACY1"  # Grade 1 second
    assert sell_orders[1].grade == 1


def test_sell_to_target():
    """
    Test: Sells move toward target (current - target), not to drift tolerance.
    """
    current = {AssetClass.US_LARGE_CORE: Decimal('40.0')}  # 40% current
    targets = {AssetClass.US_LARGE_CORE: Decimal('30.0')}  # 30% target
    drifts = {AssetClass.US_LARGE_CORE: Decimal('5.0')}  # drift unused
    
    # Delta = 40% - 30% = 10% (sell to target)
    deltas = calculate_drift_deltas(current, targets, drifts)
    
    assert AssetClass.US_LARGE_CORE in deltas
    assert deltas[AssetClass.US_LARGE_CORE] == Decimal('10.0')  # Sell 10% to reach target


def test_prefer_full_liquidation():
    """
    Test: If position value ≤ required sell, liquidate 100%.
    """
    holdings = [
        MappedHolding(
            ticker="SMALL",
            value=Decimal('10000'),  # Small position
            unrealized_gain_loss=Decimal('2000'),
            model_ticker="SPYM",
            asset_class=AssetClass.US_LARGE_CORE,
            grade=2
        ),
    ]
    
    # Required to sell $15,000, but position is only $10,000
    # Should liquidate 100% of position
    sell_orders = liquidate_waterfall(
        AssetClass.US_LARGE_CORE,
        Decimal('15000'),
        holdings,
        Decimal('100000')
    )
    
    assert len(sell_orders) == 1
    assert sell_orders[0].ticker == "SMALL"
    assert sell_orders[0].value == Decimal('10000')  # 100% liquidation


def test_individual_stocks_excluded():
    """
    Test: Individual stocks not included in rebalancing math.
    """
    holdings = [
        Holding(ticker="AAPL", value=Decimal('100000'), unrealized_gain_loss=Decimal('20000'), is_side_pocket=True),
        Holding(ticker="SPYM", value=Decimal('200000'), unrealized_gain_loss=Decimal('-5000'), is_side_pocket=False),
    ]
    
    side_pocket, rebalanceable = classify_holdings(holdings)
    
    # Only rebalanceable holdings should be used in calculations
    assert len(rebalanceable) == 1
    assert rebalanceable[0].ticker == "SPYM"
    assert len(side_pocket) == 1
    assert side_pocket[0].ticker == "AAPL"


# ---- Full rebalance tests (pre/post totals, cash flow) ----

def _minimal_prospect_data(holdings_value=Decimal('100000'), with_side_pocket=False):
    """Minimal prospect: one rebalanceable holding mapping to US_LARGE_CORE."""
    holdings = [
        Holding(ticker="LEG", value=holdings_value, unrealized_gain_loss=Decimal('0'), is_side_pocket=False),
    ]
    if with_side_pocket:
        holdings.append(Holding(ticker="SIDE", value=Decimal('10000'), unrealized_gain_loss=Decimal('0'), is_side_pocket=True))
    total = sum(h.value for h in holdings)
    return {
        'holdings': holdings,
        'total_value': total,
        'product_equivalents': {'LEG': {'SPYM': 2}},
        'manual_mappings': {},
        'forced_sale_holdings': [],
    }


def _minimal_strategy():
    """One asset class at 100% target, 0 drift."""
    return {
        'positions': [
            {'model_ticker': 'SPYM', 'asset_class': 'US Large Core', 'target_allocation': 100, 'drift_percentage': 0},
        ],
        'version': 1,
    }


def test_rebalance_pre_total_equals_post_total_no_trades():
    """Pre and post portfolio totals must be equal when no sells/buys (already at target)."""
    prospect_data = _minimal_prospect_data(Decimal('100000'))
    strategy = _minimal_strategy()
    result = rebalance(prospect_data, strategy)
    pre_total = sum(ph.value for ph in result.pre_holdings)
    post_total = sum(poh.value for poh in result.post_holdings)
    assert pre_total == post_total, f"pre_total={pre_total} != post_total={post_total}"


def test_rebalance_pre_total_equals_post_total_with_side_pocket():
    """Pre and post totals equal when prospect has side pocket (non-rebalanceable) holdings."""
    prospect_data = _minimal_prospect_data(Decimal('100000'), with_side_pocket=True)
    strategy = _minimal_strategy()
    result = rebalance(prospect_data, strategy)
    pre_total = sum(ph.value for ph in result.pre_holdings)
    post_total = sum(poh.value for poh in result.post_holdings)
    assert pre_total == post_total, f"pre_total={pre_total} != post_total={post_total}"


def test_rebalance_pre_total_equals_post_total_with_sells_and_buys():
    """Pre and post totals equal when rebalance triggers sells and buys (two asset classes)."""
    # Portfolio: 100% in US_LARGE_CORE; strategy wants 50% US_LARGE_CORE, 50% US_LARGE_GROWTH
    prospect_data = {
        'holdings': [
            Holding(ticker="LEG", value=Decimal('100000'), unrealized_gain_loss=Decimal('0'), is_side_pocket=False),
        ],
        'total_value': Decimal('100000'),
        'product_equivalents': {'LEG': {'SPYM': 2}},
        'manual_mappings': {},
        'forced_sale_holdings': [],
    }
    strategy = {
        'positions': [
            {'model_ticker': 'SPYM', 'asset_class': 'US Large Core', 'target_allocation': 50, 'drift_percentage': 0},
            {'model_ticker': 'SPYG', 'asset_class': 'US Large Growth', 'target_allocation': 50, 'drift_percentage': 0},
        ],
        'version': 1,
    }
    result = rebalance(prospect_data, strategy)
    pre_total = sum(ph.value for ph in result.pre_holdings)
    post_total = sum(poh.value for poh in result.post_holdings)
    assert pre_total == post_total, f"pre_total={pre_total} != post_total={post_total}"


def test_rebalance_cash_does_not_exceed_proceeds():
    """Cash residual plus total bought should not exceed proceeds from sells (we only spend what we have)."""
    prospect_data = _minimal_prospect_data(Decimal('100000'))
    strategy = {
        'positions': [
            {'model_ticker': 'SPYM', 'asset_class': 'US Large Core', 'target_allocation': 50, 'drift_percentage': 0},
            {'model_ticker': 'SPYG', 'asset_class': 'US Large Growth', 'target_allocation': 50, 'drift_percentage': 0},
        ],
        'version': 1,
    }
    result = rebalance(prospect_data, strategy)
    total_sold = sum(so.value for so in result.sell_orders)
    total_bought = sum(bo.value for bo in result.buy_orders)
    # We can only spend up to total_sold on buys; cash = total_sold - total_bought (within rounding)
    assert total_bought <= total_sold + Decimal('1'), "Should not buy more than proceeds (allow 1 unit rounding)"
    assert result.cash_residual >= Decimal('0'), "Cash residual must be non-negative"


def test_rebalance_post_holdings_sum_equals_pre_total():
    """Sum of post_holdings must equal sum of pre_holdings (conservation of portfolio value)."""
    prospect_data = _minimal_prospect_data(Decimal('250000'))
    strategy = {
        'positions': [
            {'model_ticker': 'SPYM', 'asset_class': 'US Large Core', 'target_allocation': 60, 'drift_percentage': 5},
            {'model_ticker': 'SPYG', 'asset_class': 'US Large Growth', 'target_allocation': 40, 'drift_percentage': 5},
        ],
        'version': 1,
    }
    result = rebalance(prospect_data, strategy)
    pre_total = sum(ph.value for ph in result.pre_holdings)
    post_total = sum(poh.value for poh in result.post_holdings)
    assert pre_total == post_total, f"Pre total {pre_total} != post total {post_total}"


def test_calculate_buys_uses_full_portfolio_for_targets():
    """calculate_buys should use total_value for target dollar amounts, not just remaining_value."""
    # Underweight: US_LARGE_CORE at 40% of remaining_value; target 50% of full portfolio
    # remaining_value=80k, total_value=100k -> target_value=50k, current_value=32k, buy=18k
    underweight = {AssetClass.US_LARGE_CORE: Decimal('40.0')}
    remaining_value = Decimal('80000')
    total_value = Decimal('100000')
    targets = {AssetClass.US_LARGE_CORE: Decimal('50.0')}
    model_tickers = {AssetClass.US_LARGE_CORE: 'SPYM'}
    orders = calculate_buys(underweight, remaining_value, total_value, targets, model_tickers)
    assert len(orders) == 1
    # target_value = 50% * 100k = 50k, current_value = 40% * 80k = 32k, buy = 18k
    assert orders[0].value == round_to_precision(Decimal('18000'))
    assert orders[0].model_ticker == 'SPYM'
