"""
Unit tests for core rebalancing logic.
"""
import pytest
from decimal import Decimal
from backend.logic.rebalancer import (
    Holding, MappedHolding, AssetClass, rebalance,
    classify_holdings, calculate_current_allocations, calculate_drift_deltas,
    calculate_buys, calculate_buys_by_ticker, liquidate_waterfall, round_to_precision,
    map_holdings_to_model_tickers, build_equivalent_usage_rows,
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


def _two_class_overweight_core_prospect(*, model_ticker: str = "SPYM"):
    """$100k portfolio fully mapped to US Large Core; triggers sells and growth buys."""
    return {
        'holdings': [
            Holding(ticker="LEG", value=Decimal('100000'), unrealized_gain_loss=Decimal('0'), is_side_pocket=False),
        ],
        'total_value': Decimal('100000'),
        'product_equivalents': {},
        'manual_mappings': {
            'LEG': {'model_ticker': model_ticker, 'grade': 2},
        },
        'forced_sale_holdings': [],
    }


def test_single_strategy_buys_match_legacy_calculate_buys():
    """
    When each asset class has one model ticker, per-ticker buys match legacy per-class buys.
    """
    prospect_data = _two_class_overweight_core_prospect()
    strategy = {
        'positions': [
            {'model_ticker': 'SPYM', 'asset_class': 'US Large Core', 'target_allocation': 60, 'drift_percentage': 0},
            {'model_ticker': 'SPYG', 'asset_class': 'US Large Growth', 'target_allocation': 40, 'drift_percentage': 0},
        ],
        'version': 1,
    }
    result = rebalance(prospect_data, strategy)

    assert len(result.sell_orders) == 1
    assert result.sell_orders[0].value == Decimal('40000')

    # Legacy path: underweight growth only; one buy into SPYG for full $40k proceeds.
    assert len(result.buy_orders) == 1
    assert result.buy_orders[0].model_ticker == 'SPYG'
    assert result.buy_orders[0].value == round_to_precision(Decimal('40000'))

    # Explicit equivalence to calculate_buys() after the same sell set.
    strategy_positions = {'SPYM': AssetClass.US_LARGE_CORE, 'SPYG': AssetClass.US_LARGE_GROWTH}
    mapped, _ = map_holdings_to_model_tickers(
        prospect_data['holdings'],
        prospect_data['product_equivalents'],
        prospect_data['manual_mappings'],
        strategy_positions,
    )
    total_sold = sum(so.value for so in result.sell_orders)
    remaining_value = prospect_data['total_value'] - total_sold
    remaining_holdings = [
        MappedHolding(
            ticker=h.ticker,
            value=h.value - total_sold,
            unrealized_gain_loss=Decimal('0'),
            model_ticker=h.model_ticker,
            asset_class=h.asset_class,
            grade=h.grade,
        )
        for h in mapped
    ]
    current_after_sells = calculate_current_allocations(remaining_holdings, remaining_value)
    targets = {
        AssetClass.US_LARGE_CORE: Decimal('60'),
        AssetClass.US_LARGE_GROWTH: Decimal('40'),
    }
    underweight = {
        ac: current_after_sells.get(ac, Decimal('0'))
        for ac, target_pct in targets.items()
        if current_after_sells.get(ac, Decimal('0')) < target_pct
    }
    legacy_buys = calculate_buys(
        underweight,
        remaining_value,
        prospect_data['total_value'],
        targets,
        {AssetClass.US_LARGE_CORE: 'SPYM', AssetClass.US_LARGE_GROWTH: 'SPYG'},
    )
    assert len(legacy_buys) == 1
    assert legacy_buys[0].model_ticker == result.buy_orders[0].model_ticker
    assert legacy_buys[0].value == result.buy_orders[0].value


def test_blend_multi_ticker_produces_distinct_per_ticker_buys():
    """
    Blended targets with VOO + IVV in the same asset class produce separate buy lines per ticker.
    """
    prospect_data = _two_class_overweight_core_prospect(model_ticker="VOO")
    strategy = {
        'positions': [
            {'model_ticker': 'VOO', 'asset_class': 'US Large Core', 'target_allocation': 40, 'drift_percentage': 0},
            {'model_ticker': 'IVV', 'asset_class': 'US Large Core', 'target_allocation': 20, 'drift_percentage': 0},
            {'model_ticker': 'SPYG', 'asset_class': 'US Large Growth', 'target_allocation': 40, 'drift_percentage': 0},
        ],
        'version': 1,
    }
    result = rebalance(prospect_data, strategy)

    # Same class-level sell as single-strategy 60/40 split (100% core -> 60% core target).
    assert len(result.sell_orders) == 1
    assert result.sell_orders[0].value == Decimal('40000')

    # VOO is not bought: after the class-level sell, the kept LEG position stays mapped to
    # VOO at $60k (60% of portfolio), which already meets VOO's 40% target.
    tickers = {bo.model_ticker for bo in result.buy_orders}
    assert tickers == {'IVV', 'SPYG'}
    assert len(result.buy_orders) == 2

    by_ticker = {bo.model_ticker: bo.value for bo in result.buy_orders}
    assert by_ticker['IVV'] > Decimal('0')
    assert by_ticker['SPYG'] > Decimal('0')
    assert by_ticker['SPYG'] > by_ticker['IVV']  # 40% target vs 20% target (before scaling)

    # Legacy per-class buy would collapse growth into one line and ignore VOO/IVV split.
    strategy_positions = {
        'VOO': AssetClass.US_LARGE_CORE,
        'IVV': AssetClass.US_LARGE_CORE,
        'SPYG': AssetClass.US_LARGE_GROWTH,
    }
    mapped, _ = map_holdings_to_model_tickers(
        prospect_data['holdings'],
        prospect_data['product_equivalents'],
        prospect_data['manual_mappings'],
        strategy_positions,
    )
    total_sold = sum(so.value for so in result.sell_orders)
    remaining_value = prospect_data['total_value'] - total_sold
    remaining_holdings = [
        MappedHolding(
            ticker=h.ticker,
            value=h.value - total_sold,
            unrealized_gain_loss=Decimal('0'),
            model_ticker=h.model_ticker,
            asset_class=h.asset_class,
            grade=h.grade,
        )
        for h in mapped
    ]
    current_after_sells = calculate_current_allocations(remaining_holdings, remaining_value)
    targets = {
        AssetClass.US_LARGE_CORE: Decimal('60'),
        AssetClass.US_LARGE_GROWTH: Decimal('40'),
    }
    underweight = {
        ac: current_after_sells.get(ac, Decimal('0'))
        for ac, target_pct in targets.items()
        if current_after_sells.get(ac, Decimal('0')) < target_pct
    }
    legacy_buys = calculate_buys(
        underweight,
        remaining_value,
        prospect_data['total_value'],
        targets,
        {AssetClass.US_LARGE_CORE: 'VOO', AssetClass.US_LARGE_GROWTH: 'SPYG'},
    )
    assert len(legacy_buys) == 1
    assert legacy_buys[0].model_ticker == 'SPYG'
    assert len(result.buy_orders) > len(legacy_buys)
    assert result.buy_orders[0].value > legacy_buys[0].value or len(result.buy_orders) > 1


def test_calculate_buys_by_ticker_splits_within_asset_class():
    """Direct unit check: per-ticker buys fire for each underweight model ticker."""
    targets_by_ticker = {
        'VOO': Decimal('40'),
        'IVV': Decimal('20'),
        'SPYG': Decimal('40'),
    }
    strategy_positions = {
        'VOO': AssetClass.US_LARGE_CORE,
        'IVV': AssetClass.US_LARGE_CORE,
        'SPYG': AssetClass.US_LARGE_GROWTH,
    }
    # After sells: $60k kept, all still in SPYM slot (100% of remaining in core tickers = 0 for VOO/IVV)
    current_by_ticker = {'SPYM': Decimal('100')}
    orders = calculate_buys_by_ticker(
        current_by_ticker,
        Decimal('60000'),
        Decimal('100000'),
        targets_by_ticker,
        strategy_positions,
    )
    tickers = {o.model_ticker for o in orders}
    assert tickers == {'VOO', 'IVV', 'SPYG'}
    assert sum(o.value for o in orders) == round_to_precision(Decimal('100000'))


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


# ---- Regression tests for sell attribution, dollar splits, and cash reserve ----

def test_rebalance_duplicate_ticker_lots_not_double_subtracted():
    """Selling one lot of a ticker must not reduce other lots of the same ticker."""
    # Two $50k lots of LEG; strategy wants 50% Core / 50% Growth -> sell exactly $50k (one lot)
    prospect_data = {
        'holdings': [
            Holding(ticker="LEG", value=Decimal('50000'), unrealized_gain_loss=Decimal('0'), is_side_pocket=False),
            Holding(ticker="LEG", value=Decimal('50000'), unrealized_gain_loss=Decimal('0'), is_side_pocket=False),
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
    total_sold = sum(so.value for so in result.sell_orders)
    assert total_sold == Decimal('50000')
    # The second lot must survive as a kept position
    kept_leg = sum(poh.value for poh in result.post_holdings if poh.ticker == "LEG")
    assert kept_leg == Decimal('50000')
    pre_total = sum(ph.value for ph in result.pre_holdings)
    post_total = sum(poh.value for poh in result.post_holdings)
    assert pre_total == post_total == Decimal('100000')


def test_rebalance_forced_sale_does_not_reduce_mapped_holding_with_same_ticker():
    """A forced-sale order must not be subtracted from a mapped holding of the same ticker."""
    prospect_data = {
        'holdings': [
            Holding(ticker="LEG", value=Decimal('50000'), unrealized_gain_loss=Decimal('0'), is_side_pocket=False),
        ],
        'total_value': Decimal('70000'),
        'product_equivalents': {'LEG': {'SPYM': 2}},
        'manual_mappings': {},
        'forced_sale_holdings': [
            Holding(ticker="LEG", value=Decimal('20000'), unrealized_gain_loss=Decimal('0'), is_side_pocket=False),
        ],
    }
    strategy = {
        'positions': [
            {'model_ticker': 'SPYM', 'asset_class': 'US Large Core', 'target_allocation': 100, 'drift_percentage': 0},
        ],
        'version': 1,
    }
    result = rebalance(prospect_data, strategy)
    # Mapped $50k LEG is at/below target so it must be kept in full
    kept_leg = sum(poh.value for poh in result.post_holdings if poh.ticker == "LEG")
    assert kept_leg == Decimal('50000')
    pre_total = sum(ph.value for ph in result.pre_holdings)
    post_total = sum(poh.value for poh in result.post_holdings)
    assert pre_total == post_total == Decimal('70000')


def test_dollar_split_with_unknown_model_ticker_goes_fully_unmapped():
    """A split referencing a ticker not in the strategy must not be partially mapped."""
    holdings = [Holding(ticker="MIX", value=Decimal('100000'), unrealized_gain_loss=Decimal('1000'), is_side_pocket=False)]
    manual_mappings = {
        'MIX': {
            'model_ticker': None,
            'grade': 2,
            'dollar_split': {'SPYM': 60000, 'NOT_IN_STRATEGY': 40000},
        },
    }
    strategy_positions = {'SPYM': AssetClass.US_LARGE_CORE}
    mapped, unmapped = map_holdings_to_model_tickers(holdings, {}, manual_mappings, strategy_positions)
    assert mapped == []
    assert len(unmapped) == 1
    assert unmapped[0].value == Decimal('100000')


def test_rebalance_existing_cash_counts_toward_cash_target():
    """Cash already in the portfolio satisfies the cash target; buys are not under-funded."""
    # 100% cash portfolio; model: 90% Core / 10% Cash -> expect $90k invested, $10k cash kept
    prospect_data = {
        'holdings': [
            Holding(ticker="CASH", value=Decimal('100000'), unrealized_gain_loss=Decimal('0'), is_side_pocket=False),
        ],
        'total_value': Decimal('100000'),
        'product_equivalents': {},
        'manual_mappings': {},
        'forced_sale_holdings': [],
    }
    strategy = {
        'positions': [
            {'model_ticker': 'SPYM', 'asset_class': 'US Large Core', 'target_allocation': 90, 'drift_percentage': 0},
            {'model_ticker': 'CASHX', 'asset_class': 'Cash', 'target_allocation': 10, 'drift_percentage': 0},
        ],
        'version': 1,
    }
    result = rebalance(prospect_data, strategy)
    total_bought = sum(bo.value for bo in result.buy_orders)
    assert total_bought == Decimal('90000'), f"Expected $90k invested, got {total_bought}"
    post_cash = sum(poh.value for poh in result.post_holdings if poh.asset_class == "Cash")
    assert post_cash == Decimal('10000'), f"Expected $10k cash at target, got {post_cash}"


# ---- Ticker matching is case/whitespace-insensitive ----

def test_product_equivalent_matching_is_case_insensitive():
    """Lowercase holding ticker matches an uppercase GE_Alt legacy ticker (and vice versa)."""
    holdings = [
        Holding(ticker="leg", value=Decimal('50000'), unrealized_gain_loss=Decimal('0'), is_side_pocket=False),
        Holding(ticker=" OTHER ", value=Decimal('50000'), unrealized_gain_loss=Decimal('0'), is_side_pocket=False),
    ]
    product_equivalents = {'LEG': {'SPYM': 2}, 'other': {'SPYG': 1}}
    strategy_positions = {'SPYM': AssetClass.US_LARGE_CORE, 'SPYG': AssetClass.US_LARGE_GROWTH}
    mapped, unmapped = map_holdings_to_model_tickers(holdings, product_equivalents, {}, strategy_positions)
    assert unmapped == []
    by_model = {m.model_ticker: m for m in mapped}
    assert by_model['SPYM'].ticker == "leg"  # original ticker preserved on the mapped holding
    assert by_model['SPYG'].grade == 1


def test_manual_mapping_matching_is_case_insensitive():
    """Manual mapping saved with different case still applies to the holding."""
    holdings = [
        Holding(ticker="abc", value=Decimal('10000'), unrealized_gain_loss=Decimal('0'), is_side_pocket=False),
    ]
    manual_mappings = {'ABC': {'model_ticker': 'SPYM', 'grade': 1}}
    strategy_positions = {'SPYM': AssetClass.US_LARGE_CORE}
    mapped, unmapped = map_holdings_to_model_tickers(holdings, {}, manual_mappings, strategy_positions)
    assert unmapped == []
    assert len(mapped) == 1
    assert mapped[0].model_ticker == 'SPYM'
    assert mapped[0].grade == 1


def test_build_equivalent_usage_rows_flags_manual_and_ge_alt():
    mapped = [
        MappedHolding("LEG", Decimal('1000'), Decimal('0'), "SPYM", AssetClass.US_LARGE_CORE, 2),
        MappedHolding("MAN", Decimal('1000'), Decimal('0'), "SPYG", AssetClass.US_LARGE_GROWTH, 1),
        MappedHolding("CASH", Decimal('500'), Decimal('0'), "CASHX", AssetClass.CASH, 0),
    ]
    pe = {"LEG": {"SPYM": 2}}
    manual = {"MAN": {"model_ticker": "SPYG", "grade": 1}}
    rows = build_equivalent_usage_rows(mapped, pe, manual)
    by_legacy = {r["legacy_ticker"]: r for r in rows}
    assert by_legacy["LEG"]["mapping_source"] == "ge_alt"
    assert by_legacy["LEG"]["in_product_equivalents"] is True
    assert by_legacy["MAN"]["mapping_source"] == "manual"
    assert by_legacy["MAN"]["in_product_equivalents"] is False
    assert by_legacy["CASH"]["mapping_source"] == "cash"
    assert rows[0]["legacy_ticker"] == "MAN"  # proposal-only rows sorted first
