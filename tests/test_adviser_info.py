"""Adviser Info aggregation and CRD editing rules."""
from decimal import Decimal

import pytest
from fastapi import HTTPException

from backend.api.routes.admin import registration_crd_by_adviser
from backend.api.routes.monitoring import (
    _assemble_adviser_info,
    _count_advisers_missing_crd,
    _crd_gaps_from_snapshots,
    _fill_blank_adviser_crds,
    _normalize_advisor_crd,
    _unique_crd_by_adviser,
)


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


def test_missing_crd_count_skips_advisers_off_the_snapshot_and_majority_conflicts():
    items = _assemble_adviser_info(
        [
            ("Blank, Ann", None, 2),
            ("Split, Cara", "111", 1),
            ("Split, Cara", "222", 3),
            ("Gone, Dee", None, 4),
        ],
        [
            ("Blank, Ann", 2, Decimal("10")),
            ("Split, Cara", 4, Decimal("20")),
        ],
    )
    assert _count_advisers_missing_crd(items) == 1


class _Snap:
    def __init__(self, total_value):
        self.total_value = total_value


class _Account:
    def __init__(self, advisor, advisor_crd=None):
        self.advisor = advisor
        self.advisor_crd = advisor_crd


def test_crd_gaps_flag_missing_and_conflicts_only():
    snapshots = [
        (_Snap(100), _Account("Missing, Ann")),
        (_Snap(50), _Account("Missing, Ann", "")),
        (_Snap(10), _Account("Partial, Bob", "111")),
        (_Snap(5), _Account("Partial, Bob", None)),
        (_Snap(20), _Account("Split, Cara", "111")),
        (_Snap(30), _Account("Split, Cara", "222")),
        (_Snap(1), _Account("  ")),
    ]
    missing, conflicts = _crd_gaps_from_snapshots(snapshots)
    assert [item.adviser_name for item in missing] == ["Missing, Ann"]
    assert missing[0].account_count == 2
    assert missing[0].total_aum == Decimal("150")
    assert missing[0].status == "missing"
    assert [item.adviser_name for item in conflicts] == ["Split, Cara"]
    assert conflicts[0].crds == ["111", "222"]
    assert conflicts[0].status == "conflict"

    # A CRD that lives on an account outside this snapshot still counts.
    covered, still_split = _crd_gaps_from_snapshots(
        snapshots,
        [("Missing, Ann", "3095194"), ("Split, Cara", "111"), ("Split, Cara", "222")],
    )
    assert covered == []
    assert [item.adviser_name for item in still_split] == ["Split, Cara"]


def test_known_crd_fills_blanks_only_when_the_adviser_has_one_number():
    accounts = [
        _Account("Known, Dee"),
        _Account("Split, Cara"),
        _Account("Kept, Eve", "999"),
    ]
    known = _unique_crd_by_adviser([
        ("Known, Dee", "3095194"),
        ("Known, Dee", "3095194"),
        ("Known, Dee", None),
        ("Split, Cara", "111"),
        ("Split, Cara", "222"),
        ("", "000"),
    ])
    assert known == {"Known, Dee": "3095194"}
    filled = _fill_blank_adviser_crds(accounts, known)
    assert filled == 1
    assert accounts[0].advisor_crd == "3095194"
    assert accounts[1].advisor_crd is None
    assert accounts[2].advisor_crd == "999"


def test_registration_upload_omits_blank_crd_so_manual_values_stay():
    mapped = registration_crd_by_adviser([
        {"advisor": "Known, Dee", "advisor_crd": None},
        {"advisor": "New, Fay", "advisor_crd": " 4907880 "},
    ])
    assert mapped == {"new, fay": "4907880"}
    manual = "3095194"
    key = "known, dee"
    if key in mapped:
        manual = mapped[key]
    assert manual == "3095194"


def test_normalize_advisor_crd_accepts_digits_and_blank():
    assert _normalize_advisor_crd(" 4907880 ") == "4907880"
    assert _normalize_advisor_crd("  ") is None
    assert _normalize_advisor_crd(None) is None
    with pytest.raises(HTTPException):
        _normalize_advisor_crd("CRD-12")
