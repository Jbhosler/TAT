from datetime import date
from decimal import Decimal
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from backend.api.routes import monitoring


class _FakeDateQuery:
    def __init__(self, rows):
        self._rows = rows

    def filter(self, *_args, **_kwargs):
        return self

    def distinct(self):
        return self

    def order_by(self, *_args, **_kwargs):
        return self

    def all(self):
        return self._rows


class _FakeDateDb:
    def __init__(self, rows):
        self._rows = rows

    def query(self, *_args, **_kwargs):
        return _FakeDateQuery(self._rows)


class _FakeScalarDateQuery:
    def __init__(self, value):
        self._value = value

    def filter(self, *_args, **_kwargs):
        return self

    def first(self):
        return (self._value,)


class _FakeYtdBaselineDb:
    def __init__(self, query_values):
        self._query_values = list(query_values)

    def query(self, *_args, **_kwargs):
        return _FakeScalarDateQuery(self._query_values.pop(0))


def test_get_all_snapshot_dates_returns_non_null_dates_newest_first():
    rows = [
        (date(2026, 6, 30),),
        (date(2026, 5, 31),),
        (None,),
    ]

    assert monitoring._get_all_snapshot_dates(_FakeDateDb(rows)) == [
        date(2026, 6, 30),
        date(2026, 5, 31),
    ]


def test_resolve_ingest_change_dates_uses_explicit_dates():
    prior = date(2026, 5, 31)
    current = date(2026, 6, 30)

    assert monitoring._resolve_ingest_change_dates(object(), prior, current) == (prior, current)


def test_resolve_ingest_change_dates_rejects_partial_selection():
    with pytest.raises(HTTPException) as exc:
        monitoring._resolve_ingest_change_dates(object(), date(2026, 5, 31), None)

    assert exc.value.status_code == 400
    assert "Both prior_as_of_date and current_as_of_date" in exc.value.detail


def test_resolve_ingest_change_dates_rejects_same_date():
    same_date = date(2026, 6, 30)

    with pytest.raises(HTTPException) as exc:
        monitoring._resolve_ingest_change_dates(object(), same_date, same_date)

    assert exc.value.status_code == 400
    assert "two different snapshot dates" in exc.value.detail


def test_resolve_ingest_change_dates_defaults_to_latest_two(monkeypatch):
    prior = date(2026, 5, 31)
    current = date(2026, 6, 30)
    monkeypatch.setattr(
        monitoring,
        "_get_two_latest_snapshot_dates",
        lambda _db: (current, prior),
    )

    assert monitoring._resolve_ingest_change_dates(object(), None, None) == (prior, current)


def test_aggregate_strategy_snapshots_groups_accounts_and_aum_by_model_name():
    rows = [
        (
            SimpleNamespace(total_value=Decimal("100.00")),
            SimpleNamespace(external_model_name="Growth", advisor="A"),
        ),
        (
            SimpleNamespace(total_value=Decimal("250.00")),
            SimpleNamespace(external_model_name="Growth", advisor="B"),
        ),
        (
            SimpleNamespace(total_value=Decimal("50.00")),
            SimpleNamespace(external_model_name="", advisor="C"),
        ),
    ]

    result = monitoring._aggregate_strategy_snapshots(rows)

    assert result["Growth"]["account_count"] == 2
    assert result["Growth"]["aum"] == Decimal("350.00")
    assert result["Unmapped"]["account_count"] == 1
    assert result["Unmapped"]["aum"] == Decimal("50.00")


def test_advisers_for_rows_ignores_blank_names():
    rows = [
        (SimpleNamespace(), SimpleNamespace(advisor=" Adviser A ")),
        (SimpleNamespace(), SimpleNamespace(advisor="")),
        (SimpleNamespace(), SimpleNamespace(advisor=None)),
        (SimpleNamespace(), SimpleNamespace(advisor="Adviser B")),
    ]

    assert monitoring._advisers_for_rows(rows) == {"Adviser A", "Adviser B"}


def test_get_ytd_baseline_date_prefers_latest_prior_year_snapshot():
    db = _FakeYtdBaselineDb([date(2025, 12, 31)])

    assert monitoring._get_ytd_baseline_date(db, date(2026, 1, 31)) == date(2025, 12, 31)


def test_get_ytd_baseline_date_falls_back_to_earliest_current_year_snapshot():
    db = _FakeYtdBaselineDb([None, date(2026, 1, 31)])

    assert monitoring._get_ytd_baseline_date(db, date(2026, 6, 22)) == date(2026, 1, 31)


def test_merge_adviser_strategy_export_computes_ytd_and_adviser_totals():
    current = {
        ("Adviser A", "Growth"): {"account_count": 2, "aum": Decimal("300.00")},
        ("Adviser A", "Income"): {"account_count": 1, "aum": Decimal("100.00")},
        ("Adviser B", "Growth"): {"account_count": 1, "aum": Decimal("50.00")},
    }
    baseline = {
        ("Adviser A", "Growth"): {"account_count": 1, "aum": Decimal("200.00")},
        ("Adviser A", "Income"): {"account_count": 1, "aum": Decimal("80.00")},
        ("Adviser A", "Legacy"): {"account_count": 1, "aum": Decimal("40.00")},
    }
    crd_by_adviser = {"Adviser A": "3095194"}

    rows = monitoring._merge_adviser_strategy_export_rows(current, baseline, crd_by_adviser)
    by_key = {(r.adviser_name, r.strategy_name): r for r in rows}

    growth = by_key[("Adviser A", "Growth")]
    assert growth.crd == "3095194"
    assert growth.total_aum_by_adviser == Decimal("400.00")
    assert growth.aum_by_strategy == Decimal("300.00")
    assert growth.ytd_aum_change == Decimal("100.00")
    assert growth.account_count == 2

    income = by_key[("Adviser A", "Income")]
    assert income.total_aum_by_adviser == Decimal("400.00")
    assert income.ytd_aum_change == Decimal("20.00")

    lost = by_key[("Adviser A", "Legacy")]
    assert lost.aum_by_strategy == Decimal("0")
    assert lost.ytd_aum_change == Decimal("-40.00")
    assert lost.account_count == 0
    assert lost.crd == "3095194"

    other = by_key[("Adviser B", "Growth")]
    assert other.crd is None
    assert other.total_aum_by_adviser == Decimal("50.00")
    assert other.ytd_aum_change == Decimal("50.00")


def test_export_strategy_column_maps_uploaded_model_names():
    assert monitoring._export_strategy_column("Auour Instinct Global Equity Strategy") == "global_equity"
    assert monitoring._export_strategy_column("Auour Instinct Global Balanced Strategy") == "global_balanced"
    assert monitoring._export_strategy_column("Auour Instinct Global Fixed Income Strategy") == "global_fixed_income"
    assert monitoring._export_strategy_column("Auour Ultra Low Duration Strategy") == "uld"
    assert monitoring._export_strategy_column("ULD") == "uld"
    assert monitoring._export_strategy_column("Auour Instinct Global Multi-Asset Income Strategy") == "multi_asset_income"
    assert monitoring._export_strategy_column("Unmapped") is None


def test_format_export_dollars_uses_accounting_format():
    assert monitoring._format_export_dollars(Decimal("61059800.62")) == "$61,059,800.62"
    assert monitoring._format_export_dollars(Decimal("-11722215.29")) == "($11,722,215.29)"
    assert monitoring._format_export_dollars(Decimal("0")) == "$ -"
    assert monitoring._format_export_dollars(Decimal("1362553.90")) == "$1,362,553.90"


def test_adviser_aum_export_table_is_one_row_per_adviser():
    from backend.api.models.schemas import AdviserStrategyExportItem

    def row(crd, adviser, total, strategy, aum, ytd, accounts):
        return AdviserStrategyExportItem(
            crd=crd,
            adviser_name=adviser,
            total_aum_by_adviser=Decimal(total),
            strategy_name=strategy,
            aum_by_strategy=Decimal(aum),
            ytd_aum_change=Decimal(ytd),
            account_count=accounts,
        )

    long_rows = [
        row("1893929", "Howell, Richard", "10705402.74", "Auour Instinct Global Equity Strategy", "1221724.71", "100.00", 9),
        row("1893929", "Howell, Richard", "10705402.74", "Auour Instinct Global Balanced Strategy", "6589945.09", "200.00", 43),
        row("1893929", "Howell, Richard", "10705402.74", "Auour Instinct Global Fixed Income Strategy", "931807.89", "300.00", 7),
        row("1893929", "Howell, Richard", "10705402.74", "Auour Ultra Low Duration Strategy", "414923.20", "400.00", 4),
        row("1893929", "Howell, Richard", "10705402.74", "Auour Instinct Global Multi-Asset Income Strategy", "1547001.85", "1361553.90", 17),
        row("4280808", "MACKEN ELLIOTT, Martha", "61059800.62", "Auour Instinct Global Balanced Strategy", "61059800.62", "-11722215.29", 228),
        row(None, "Small Book", "10.00", "Custom Sleeve", "10.00", "10.00", 1),
    ]

    columns, rows = monitoring._adviser_aum_export_table(long_rows)

    assert columns[:15] == [
        "CRD",
        "Adviser Name",
        "Total AUM by Adviser",
        "Total Accounts",
        "Total YTD AUM Change",
        "Global Equity $",
        "Global Equity Accounts",
        "Global Balanced $",
        "Global Balanced Accounts",
        "Global Fixed Income $",
        "Global Fixed Income Accounts",
        "ULD $",
        "ULD Accounts",
        "Multi-Asset Income $",
        "Multi-Asset Income Accounts",
    ]
    assert columns[-2:] == ["Custom Sleeve $", "Custom Sleeve Accounts"]

    by_name = {row[1]: row for row in rows}
    assert [row[1] for row in rows] == ["MACKEN ELLIOTT, Martha", "Howell, Richard", "Small Book"]

    martha = by_name["MACKEN ELLIOTT, Martha"]
    assert martha[:15] == [
        "4280808",
        "MACKEN ELLIOTT, Martha",
        "$61,059,800.62",
        "228",
        "($11,722,215.29)",
        "$ -",
        "0",
        "$61,059,800.62",
        "228",
        "$ -",
        "0",
        "$ -",
        "0",
        "$ -",
        "0",
    ]
    assert martha[-2:] == ["$ -", "0"]

    howell = by_name["Howell, Richard"]
    assert howell[:15] == [
        "1893929",
        "Howell, Richard",
        "$10,705,402.74",
        "80",
        "$1,362,553.90",
        "$1,221,724.71",
        "9",
        "$6,589,945.09",
        "43",
        "$931,807.89",
        "7",
        "$414,923.20",
        "4",
        "$1,547,001.85",
        "17",
    ]

    other = by_name["Small Book"]
    assert other[2] == "$10.00"
    assert other[3] == "1"
    assert other[5] == "$ -"
    assert other[-2:] == ["$10.00", "1"]
