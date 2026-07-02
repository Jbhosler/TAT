"""Tests for strategy blend logic."""
from decimal import Decimal
from uuid import uuid4

import pytest

from backend.logic.strategy_blend import (
    StrategyBlendError,
    _parse_blend_components,
    blend_display_name,
)


def test_parse_blend_components_requires_hundred_percent():
    sid1, sid2 = uuid4(), uuid4()
    with pytest.raises(StrategyBlendError):
        _parse_blend_components([
            {"strategy_id": str(sid1), "weight": 60},
            {"strategy_id": str(sid2), "weight": 30},
        ])


def test_parse_blend_components_rejects_non_positive_weights():
    sid1, sid2 = uuid4(), uuid4()
    with pytest.raises(StrategyBlendError):
        _parse_blend_components([
            {"strategy_id": str(sid1), "weight": 120},
            {"strategy_id": str(sid2), "weight": -20},
        ])
    with pytest.raises(StrategyBlendError):
        _parse_blend_components([
            {"strategy_id": str(sid1), "weight": 100},
            {"strategy_id": str(sid2), "weight": 0},
        ])


def test_parse_blend_components_sorts_by_weight():
    sid1, sid2 = uuid4(), uuid4()
    parsed = _parse_blend_components([
        {"strategy_id": str(sid1), "weight": 40},
        {"strategy_id": str(sid2), "weight": 60},
    ])
    assert parsed[0][0] == sid2
    assert parsed[0][1] == Decimal("60")


def test_blend_display_name_sorted_by_weight():
    sid1, sid2 = uuid4(), uuid4()
    strategies_by_id = {
        sid1: type("S", (), {"name": "Balanced"})(),
        sid2: type("S", (), {"name": "Growth"})(),
    }
    # Input order reversed; display should still list heavier weight first.
    name = blend_display_name(strategies_by_id, [
        {"strategy_id": str(sid2), "weight": 40},
        {"strategy_id": str(sid1), "weight": 60},
    ])
    assert name.index("60% Balanced") < name.index("40% Growth")
