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
