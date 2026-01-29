"""
Unit tests for core rebalancing logic.
"""
import pytest
from decimal import Decimal
from backend.logic.rebalancer import (
    Holding, MappedHolding, AssetClass, rebalance,
    classify_holdings, calculate_drift_deltas,
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


def test_sell_to_upper_drift_limit():
    """
    Test: Sells stop at (Target % + Drift %), not midpoint.
    """
    current = {AssetClass.US_LARGE_CORE: Decimal('40.0')}  # 40% current
    targets = {AssetClass.US_LARGE_CORE: Decimal('30.0')}  # 30% target
    drifts = {AssetClass.US_LARGE_CORE: Decimal('5.0')}  # 5% drift
    
    # Upper drift limit = 30% + 5% = 35%
    # Delta = 40% - 35% = 5%
    deltas = calculate_drift_deltas(current, targets, drifts)
    
    assert AssetClass.US_LARGE_CORE in deltas
    assert deltas[AssetClass.US_LARGE_CORE] == Decimal('5.0')  # Should sell 5%, not 10% to midpoint


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
