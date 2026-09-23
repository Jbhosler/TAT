"""Adviser Info aggregation and CRD editing rules."""
from decimal import Decimal

import pytest
from fastapi import HTTPException

from backend.api.routes.monitoring import _assemble_adviser_info, _normalize_advisor_crd


def test_assemble_adviser_info_uses_snapshot_totals_and_majority_crd():
    identity = [
        ("Pyle, Lester", "2747911", 3),
        ("Pyle, Lester", None, 1),
        ("Widener, Amy", "111", 1),
        ("Widener, Amy", "3111888", 3),
        ("New, Adviser", None, 2),
    ]
    snapshots = [
        ("Pyle, Lester", 4, Decimal("1000.50")),
        ("Widener, Amy", 2, Decimal("50")),
    ]

    rows = {item.adviser_name: item for item in _assemble_adviser_info(identity, snapshots)}

    assert rows["Pyle, Lester"].crd == "2747911"
    assert rows["Pyle, Lester"].account_count == 4
    assert rows["Pyle, Lester"].total_aum == Decimal("1000.50")
    assert rows["Widener, Amy"].crd == "3111888"
    assert rows["Widener, Amy"].account_count == 2
    assert rows["New, Adviser"].crd is None
    assert rows["New, Adviser"].account_count == 0
    assert rows["New, Adviser"].total_aum == Decimal("0")
    assert [item.adviser_name for item in _assemble_adviser_info(identity, snapshots)] == [
        "Pyle, Lester",
        "Widener, Amy",
        "New, Adviser",
    ]


def test_normalize_advisor_crd_accepts_digits_and_blank():
    assert _normalize_advisor_crd(" 4907880 ") == "4907880"
    assert _normalize_advisor_crd("  ") is None
    assert _normalize_advisor_crd(None) is None
    with pytest.raises(HTTPException):
        _normalize_advisor_crd("CRD-12")
