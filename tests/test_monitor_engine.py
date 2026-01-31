"""
Unit tests for monitor engine (asset class roll-up, deviation score, purity score).
"""
import pytest
from decimal import Decimal
from backend.logic.monitor_engine import (
    compute_rollup_and_scores,
    get_allocations_breakdown,
    round_to_precision,
)


def test_round_to_precision():
    assert round_to_precision(Decimal("10.1234")) == Decimal("10.123")
    assert round_to_precision(Decimal("10.1236")) == Decimal("10.124")


def test_asset_class_rollup_cash_once():
    """CASH included once; actual_pct by asset class correct."""
    holdings = [
        {"ticker": "WFMIX", "value": Decimal("10000")},
        {"ticker": "GFFFX", "value": Decimal("20000")},
    ]
    cash_value = Decimal("5000")
    positions = [
        {"model_ticker": "SPYM", "asset_class": "US Large Core", "target_allocation": 60},
        {"model_ticker": "INTL", "asset_class": "International Developed", "target_allocation": 40},
    ]
    product_equivalents = [
        {"legacy_ticker": "WFMIX", "model_ticker": "SPYM", "grade": 0},
        {"legacy_ticker": "GFFFX", "model_ticker": "INTL", "grade": 1},
    ]
    actual_by_ac, deviation_score, purity_score, holdings_meta = compute_rollup_and_scores(
        holdings=holdings,
        cash_value=cash_value,
        positions=positions,
        product_equivalents=product_equivalents,
    )
    total = 10000 + 20000 + 5000
    assert total == 35000
    # US Large Core: 10000/35000 * 100; International: 20000/35000 * 100; CASH: 5000/35000 * 100
    assert "US Large Core" in actual_by_ac
    assert "International Developed" in actual_by_ac
    assert "CASH" in actual_by_ac
    assert actual_by_ac["CASH"] == round_to_precision(Decimal("5000") / 35000 * 100)
    assert len(holdings_meta) == 3  # 2 holdings + 1 CASH row


def test_deviation_score():
    """Deviation score = sum of |actual_pct - target_pct|."""
    holdings = [{"ticker": "A", "value": Decimal("60000")}]
    cash_value = Decimal("0")
    positions = [
        {"model_ticker": "SPYM", "asset_class": "US Large Core", "target_allocation": 50},
        {"model_ticker": "INTL", "asset_class": "International Developed", "target_allocation": 50},
    ]
    product_equivalents = [{"legacy_ticker": "A", "model_ticker": "SPYM", "grade": 0}]
    actual_by_ac, deviation_score, purity_score, _ = compute_rollup_and_scores(
        holdings=holdings,
        cash_value=cash_value,
        positions=positions,
        product_equivalents=product_equivalents,
    )
    # 100% US Large Core, 0% International. Target 50/50. Deviation = |100-50| + |0-50| = 100
    assert deviation_score == Decimal("100")


def test_purity_score_grade0():
    """Purity = % from Grade 0 holdings."""
    holdings = [
        {"ticker": "A", "value": Decimal("60000")},
        {"ticker": "B", "value": Decimal("40000")},
    ]
    cash_value = Decimal("0")
    positions = [
        {"model_ticker": "SPYM", "asset_class": "US Large Core", "target_allocation": 100},
    ]
    product_equivalents = [
        {"legacy_ticker": "A", "model_ticker": "SPYM", "grade": 0},
        {"legacy_ticker": "B", "model_ticker": "SPYM", "grade": 1},
    ]
    _, _, purity_score, _ = compute_rollup_and_scores(
        holdings=holdings,
        cash_value=cash_value,
        positions=positions,
        product_equivalents=product_equivalents,
    )
    # 60k grade 0, 40k grade 1, total 100k -> purity 60%
    assert purity_score == Decimal("60.000")


def test_get_allocations_breakdown():
    """Breakdown returns actual_pct, target_pct, drift_pct per asset class."""
    actual_by_ac = {"US Large Core": Decimal("60"), "CASH": Decimal("5")}
    target_by_ac = {"US Large Core": Decimal("50"), "CASH": Decimal("5")}
    out = get_allocations_breakdown(actual_by_ac, target_by_ac)
    assert len(out) >= 2
    us = next((x for x in out if x["asset_class"] == "US Large Core"), None)
    assert us is not None
    assert us["actual_pct"] == Decimal("60")
    assert us["target_pct"] == Decimal("50")
    assert us["drift_pct"] == Decimal("10")
