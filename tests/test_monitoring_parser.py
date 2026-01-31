"""
Unit tests for aggregated holdings CSV parser (Monitoring module).
"""
import pytest
from decimal import Decimal
from backend.utils.csv_parser import (
    parse_aggregated_holdings_csv,
    _synthetic_id,
    _parse_aggregated_amount,
    _parse_as_of_date,
)


def test_synthetic_id_deterministic():
    """Same key yields same hash; different key yields different hash."""
    a, b, c, d, e = "acc1", "adv1", "model1", "firm1", "ent1"
    sid1 = _synthetic_id(a, b, c, d, e)
    sid2 = _synthetic_id(a, b, c, d, e)
    assert sid1 == sid2
    sid3 = _synthetic_id("acc2", b, c, d, e)
    assert sid1 != sid3


def test_parse_aggregated_amount():
    """Numeric parsing: commas stripped."""
    assert _parse_aggregated_amount("1,498.59") == Decimal("1498.59")
    assert _parse_aggregated_amount("16,422.32") == Decimal("16422.32")
    assert _parse_aggregated_amount("") == Decimal("0")
    assert _parse_aggregated_amount("N/A") == Decimal("0")


def test_parse_as_of_date():
    """As Of Date: DD-Mon-YY parsed correctly."""
    d = _parse_as_of_date("28-Jan-26")
    assert d is not None
    assert d.year == 2026
    assert d.month == 1
    assert d.day == 28
    assert _parse_as_of_date("") is None


def test_cash_consistency_identical_passes():
    """Group with identical Cash As Position passes (no data_inconsistency)."""
    csv = """Ticker,Market Val,Cash As Position,Account,Model,Advisor,Firm,Enterprise,As Of Date
WFMIX,1498.59,13532.47,****5038,Auour Instinct,Worthington,Cetera,Cetera,28-Jan-26
GFFFX,16422.32,13532.47,****5038,Auour Instinct,Worthington,Cetera,Cetera,28-Jan-26"""
    groups = parse_aggregated_holdings_csv(csv)
    assert len(groups) == 1
    assert groups[0]["data_inconsistency"] is False
    assert groups[0]["cash_value"] == Decimal("13532.47")


def test_cash_consistency_differing_fails():
    """Group with differing Cash As Position is flagged (data_inconsistency)."""
    csv = """Ticker,Market Val,Cash As Position,Account,Model,Advisor,Firm,Enterprise,As Of Date
WFMIX,1498.59,13532.47,****5038,Auour Instinct,Worthington,Cetera,Cetera,28-Jan-26
GFFFX,16422.32,14000.00,****5038,Auour Instinct,Worthington,Cetera,Cetera,28-Jan-26"""
    groups = parse_aggregated_holdings_csv(csv)
    assert len(groups) == 1
    assert groups[0]["data_inconsistency"] is True
    assert "synthetic_id" in groups[0]


def test_non_compounding_total():
    """total_value = sum(Market Val) + single Cash As Position (not N × cash)."""
    csv = """Ticker,Market Val,Cash As Position,Account,Model,Advisor,Firm,Enterprise,As Of Date
WFMIX,1000,500,****5038,Model1,Adv1,Firm1,Ent1,28-Jan-26
GFFFX,2000,500,****5038,Model1,Adv1,Firm1,Ent1,28-Jan-26"""
    groups = parse_aggregated_holdings_csv(csv)
    assert len(groups) == 1
    assert groups[0]["data_inconsistency"] is False
    # 1000 + 2000 + 500 (once) = 3500
    assert groups[0]["total_value"] == Decimal("3500")
    assert len(groups[0]["holdings"]) == 2


def test_duplicate_market_val_column():
    """Only first Market Val column used; total correct."""
    csv = """Ticker,Market Val,Market Val,Cash As Position,Account,Model,Advisor,Firm,Enterprise,As Of Date
WFMIX,1498.59,999.99,13532.47,****5038,Auour Instinct,Worthington,Cetera,Cetera,28-Jan-26"""
    groups = parse_aggregated_holdings_csv(csv)
    assert len(groups) == 1
    # DictReader may collapse duplicate headers; first value wins
    assert groups[0]["total_value"] == Decimal("13532.47") + Decimal("1498.59")


def test_truncated_headers():
    """Headers Cash As Po, Descriptio, Market Val resolve."""
    csv = """Descriptio,Ticker,Market Val,Cash As Po,Account,Model,Advisor,Firm,Enterprise,As Of Date
Allspring,WFMIX,1498.59,13532.47,****5038,Auour Insti,Worthington,Cetera Inve,Cetera Inve,28-Jan-26"""
    groups = parse_aggregated_holdings_csv(csv)
    assert len(groups) == 1
    assert groups[0]["data_inconsistency"] is False
    assert groups[0]["cash_value"] == Decimal("13532.47")
    assert groups[0]["holdings"][0]["ticker"] == "WFMIX"
    assert groups[0]["holdings"][0]["value"] == Decimal("1498.59")
