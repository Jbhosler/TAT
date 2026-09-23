"""Confidence matching for the one-time Advisor CRD load."""
from scripts.populate_advisor_crd import (
    confidence_score,
    load_file_advisers,
    match_advisers,
)


def test_last_first_matches_first_last():
    assert confidence_score("LESTER PYLE", "PYLE, LESTER") == 100
    assert confidence_score("Mark Feigenbaum", "Feigenbaum, Mark") == 100


def test_compound_surname_and_suffix_and_apostrophe():
    assert confidence_score("Martha MACKEN ELLIOTT", "MACKEN ELLIOTT, Martha") == 100
    assert confidence_score("Jeffrey ST CLAIR", "ST CLAIR, Jeffrey") == 100
    assert confidence_score("Steven Richardson Sr", "Richardson, Steven") == 100
    assert confidence_score("Greg D'Esposito", "D'Esposito, Greg") == 100


def test_middle_name_is_high_but_not_exact():
    assert confidence_score("Mark A Feigenbaum", "Feigenbaum, Mark") == 94


def test_same_surname_different_person_stays_below_apply_bar():
    assert confidence_score("John Smith", "Smith, Paul") == 62
    assert confidence_score("Matthew White", "Quinn, Matthew") < 80


def test_match_applies_only_clear_high_confidence():
    db = {
        "PYLE, LESTER": {"count": 3, "crds": set()},
        "Smith, Paul": {"count": 1, "crds": set()},
        "White, Matthew": {"count": 2, "crds": {"111"}},
    }
    file_rows = [
        type("A", (), {"name": "LESTER PYLE", "crd": "2747911"})(),
        type("A", (), {"name": "John Smith", "crd": "999"})(),
        type("A", (), {"name": "Matthew White", "crd": "111"})(),
        type("A", (), {"name": "Matthew J White", "crd": "222"})(),
    ]
    matches = {item.db_advisor: item for item in match_advisers(db, file_rows)}
    assert matches["PYLE, LESTER"].decision == "apply"
    assert matches["PYLE, LESTER"].crd == "2747911"
    assert matches["Smith, Paul"].decision == "review"
    assert matches["White, Matthew"].decision == "ambiguous"


def test_load_file_advisers_collapses_duplicate_rows(tmp_path):
    path = tmp_path / "CRD.csv"
    path.write_text(
        "Advisor,Advisor CRD,Account Number\n"
        "LESTER PYLE,2747911,xxxx-1\n"
        "LESTER PYLE,2747911,xxxx-2\n"
        "Eric Huck,1363941,xxxx-3\n",
        encoding="utf-8",
    )
    rows = load_file_advisers(path)
    assert {(row.name, row.crd) for row in rows} == {
        ("LESTER PYLE", "2747911"),
        ("Eric Huck", "1363941"),
    }
