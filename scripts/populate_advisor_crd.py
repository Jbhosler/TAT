#!/usr/bin/env python3
"""
One-time load of adviser CRD numbers from ReturnReports/CRD.csv.

The CSV Advisor column is matched to monitored_accounts.advisor. Names usually
follow the same words (given name and surname) but not the same spelling or
order: the file is often "First Last" and the database is often "Last, First".
Each database adviser is scored against every file adviser. A CRD is written
only when the best score is high and clearly ahead of the next candidate.

Dry-run (default) writes a review report and does not update the database:

  python scripts/populate_advisor_crd.py

Apply matches at or above 90, with at least 8 points of separation:

  python scripts/populate_advisor_crd.py --apply

The CSV is resolved from --csv, then TAT/ReturnReports/CRD.csv, then
../AuourLLM/ReturnReports/CRD.csv.
"""
from __future__ import annotations

import argparse
import csv
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

_SUFFIXES = {"jr", "sr", "ii", "iii", "iv", "esq"}
_TOKEN_RE = re.compile(r"[^a-z0-9]+")

DEFAULT_MIN_CONFIDENCE = 90
DEFAULT_MIN_GAP = 8


def name_tokens(value: str) -> List[str]:
    """Lowercase name words with punctuation and generational suffixes removed."""
    text = (value or "").casefold().replace("'", "").replace("\u2019", "")
    text = _TOKEN_RE.sub(" ", text)
    return [token for token in text.split() if token and token not in _SUFFIXES]


def _split_comma(value: str) -> Optional[Tuple[List[str], List[str]]]:
    """Return (surname, given) when the stored name uses 'Last, First'."""
    if "," not in (value or ""):
        return None
    last, _, first = value.partition(",")
    return name_tokens(last), name_tokens(first)


def _order_hypotheses(tokens: Sequence[str]) -> List[Tuple[List[str], List[str]]]:
    """
    Hypotheses for a name that is not already 'Last, First'.

    'Martha MACKEN ELLIOTT' can be surname 'Macken Elliott' or surname 'Elliott'
    with middle name 'Macken'. Both are scored.
    """
    parts = list(tokens)
    if not parts:
        return []
    if len(parts) == 1:
        return [(parts, [])]
    hypotheses = [(parts[1:], parts[:1])]
    if len(parts) > 2:
        hypotheses.append((parts[-1:], parts[:-1]))
    return hypotheses


def _surname_alignment(left: Sequence[str], right: Sequence[str]) -> float:
    if not left or not right:
        return 0.0
    if list(left) == list(right) or set(left) == set(right):
        return 1.0
    from difflib import SequenceMatcher

    ratio = SequenceMatcher(None, "".join(left), "".join(right)).ratio()
    if not (set(left) & set(right)) and ratio < 0.92:
        return ratio * 0.5
    return ratio


def _given_alignment(left: Sequence[str], right: Sequence[str]) -> float:
    if not left and not right:
        return 1.0
    if not left or not right:
        return 0.4
    if list(left) == list(right):
        return 1.0
    if left[0] == right[0]:
        return 0.93
    short, long = (left[0], right[0]) if len(left[0]) <= len(right[0]) else (right[0], left[0])
    if len(short) == 1 and long.startswith(short):
        return 0.8
    if len(short) >= 3 and long.startswith(short):
        return 0.75
    return 0.2


def _structured_pairs(csv_name: str, db_name: str) -> Iterable[Tuple[Tuple[List[str], List[str]], Tuple[List[str], List[str]]]]:
    csv_tokens = name_tokens(csv_name)
    db_tokens = name_tokens(db_name)
    csv_struct = _split_comma(csv_name)
    db_struct = _split_comma(db_name)
    if csv_struct and db_struct:
        yield csv_struct, db_struct
        return
    if db_struct:
        for hypothesis in _order_hypotheses(csv_tokens):
            yield hypothesis, db_struct
        return
    if csv_struct:
        for hypothesis in _order_hypotheses(db_tokens):
            yield csv_struct, hypothesis
        return
    for csv_hypothesis in _order_hypotheses(csv_tokens):
        for db_hypothesis in _order_hypotheses(db_tokens):
            yield csv_hypothesis, db_hypothesis


def confidence_score(csv_name: str, db_name: str) -> int:
    """
    0-100 alignment of a file adviser name to a database adviser name.

    100 means the same name words, including 'First Last' against 'Last, First'.
    A shared surname with a different given name stays well below the apply bar.
    """
    csv_tokens = name_tokens(csv_name)
    db_tokens = name_tokens(db_name)
    if not csv_tokens or not db_tokens:
        return 0

    best = 0
    if set(csv_tokens) == set(db_tokens):
        best = 100

    for (csv_surname, csv_given), (db_surname, db_given) in _structured_pairs(csv_name, db_name):
        surname = _surname_alignment(csv_surname, db_surname)
        given = _given_alignment(csv_given, db_given)
        if surname >= 0.999:
            if given >= 0.999:
                score = 100
            elif given >= 0.93:
                score = 94
            elif given >= 0.8:
                score = 80
            elif given >= 0.75:
                score = 76
            else:
                score = 62
        elif surname >= 0.92 and given >= 0.93:
            score = 86
        else:
            score = int(round(100 * (0.7 * surname + 0.3 * given)))
            if surname < 0.85:
                score = min(score, 70)
        if score > best:
            best = score
    return best


@dataclass
class FileAdviser:
    name: str
    crd: str


@dataclass
class NameMatch:
    db_advisor: str
    account_count: int
    existing_crds: Tuple[str, ...]
    csv_advisor: Optional[str]
    crd: Optional[str]
    confidence: int
    second_csv_advisor: Optional[str]
    second_confidence: int
    decision: str
    reason: str


def load_file_advisers(csv_path: Path) -> List[FileAdviser]:
    """Unique Advisor -> Advisor CRD rows. Conflicting CRDs for one name are rejected."""
    text = csv_path.read_text(encoding="utf-8-sig")
    reader = csv.DictReader(text.splitlines())
    if not reader.fieldnames:
        raise ValueError(f"No header row in {csv_path}")
    fields = {name.strip().casefold(): name for name in reader.fieldnames if name}
    advisor_key = fields.get("advisor") or fields.get("adviser")
    crd_key = fields.get("advisor crd") or fields.get("adviser crd") or fields.get("crd")
    if not advisor_key or not crd_key:
        raise ValueError("CSV must include Advisor and Advisor CRD columns")

    by_name: Dict[str, str] = {}
    for row in reader:
        name = (row.get(advisor_key) or "").strip()
        crd = re.sub(r"\s+", "", (row.get(crd_key) or "").strip())
        if not name or not crd:
            continue
        if not crd.isdigit():
            raise ValueError(f"Advisor CRD for {name!r} is not numeric: {crd!r}")
        previous = by_name.get(name)
        if previous and previous != crd:
            raise ValueError(f"Advisor {name!r} has conflicting CRDs {previous} and {crd}")
        by_name[name] = crd
    return [FileAdviser(name=name, crd=crd) for name, crd in by_name.items()]


def match_advisers(
    db_advisors: Dict[str, Dict[str, object]],
    file_advisers: Sequence[FileAdviser],
    min_confidence: int = DEFAULT_MIN_CONFIDENCE,
    min_gap: int = DEFAULT_MIN_GAP,
) -> List[NameMatch]:
    """
    Score every database adviser against the file.

    db_advisors maps the stored advisor string to {"count": int, "crds": set[str]}.
    """
    matches: List[NameMatch] = []
    for db_name, info in sorted(db_advisors.items()):
        ranked: List[Tuple[int, FileAdviser]] = []
        for adviser in file_advisers:
            ranked.append((confidence_score(adviser.name, db_name), adviser))
        ranked.sort(key=lambda item: (-item[0], item[1].name))
        best_score, best = ranked[0] if ranked else (0, None)
        second_score, second = (ranked[1][0], ranked[1][1]) if len(ranked) > 1 else (0, None)
        existing = tuple(sorted(str(value) for value in (info.get("crds") or set()) if str(value).strip()))
        count = int(info.get("count") or 0)
        blank_count = int(info.get("blank") or 0)
        decision, reason = _decision(
            best_score=best_score,
            second_score=second_score if second else 0,
            crd=best.crd if best else None,
            existing=existing,
            blank_count=blank_count,
            min_confidence=min_confidence,
            min_gap=min_gap,
        )
        matches.append(
            NameMatch(
                db_advisor=db_name,
                account_count=count,
                existing_crds=existing,
                csv_advisor=best.name if best and best_score > 0 else None,
                crd=best.crd if best and best_score > 0 else None,
                confidence=best_score,
                second_csv_advisor=second.name if second and second_score > 0 else None,
                second_confidence=second_score if second else 0,
                decision=decision,
                reason=reason,
            )
        )
    return matches


def _decision(
    best_score: int,
    second_score: int,
    crd: Optional[str],
    existing: Sequence[str],
    blank_count: int,
    min_confidence: int,
    min_gap: int,
) -> Tuple[str, str]:
    if not crd or best_score <= 0:
        return "unmatched", "No file adviser aligned to this name"
    if best_score < min_confidence:
        return "review", f"Best alignment {best_score} is below {min_confidence}"
    if second_score and best_score - second_score < min_gap:
        return "ambiguous", f"Next candidate is within {min_gap} points ({second_score})"
    if existing and existing != (crd,):
        return "conflict", f"Database already has CRD {', '.join(existing)}"
    if existing == (crd,) and blank_count == 0:
        return "unchanged", "Advisor CRD already matches"
    if existing == (crd,):
        return "apply", "Some accounts for this adviser have no CRD"
    return "apply", "High-confidence unique alignment"


def write_report(path: Path, matches: Sequence[NameMatch]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "decision",
                "confidence",
                "db_advisor",
                "csv_advisor",
                "crd",
                "account_count",
                "existing_crds",
                "second_confidence",
                "second_csv_advisor",
                "reason",
            ],
        )
        writer.writeheader()
        for match in sorted(matches, key=lambda item: (-item.confidence, item.db_advisor)):
            writer.writerow(
                {
                    "decision": match.decision,
                    "confidence": match.confidence,
                    "db_advisor": match.db_advisor,
                    "csv_advisor": match.csv_advisor or "",
                    "crd": match.crd or "",
                    "account_count": match.account_count,
                    "existing_crds": "|".join(match.existing_crds),
                    "second_confidence": match.second_confidence,
                    "second_csv_advisor": match.second_csv_advisor or "",
                    "reason": match.reason,
                }
            )


def summarize(matches: Sequence[NameMatch]) -> Dict[str, int]:
    counts: Dict[str, int] = {}
    for match in matches:
        counts[match.decision] = counts.get(match.decision, 0) + 1
    return counts


def resolve_csv_path(explicit: Optional[str]) -> Path:
    if explicit:
        path = Path(explicit)
        if not path.is_file():
            raise FileNotFoundError(path)
        return path
    candidates = [
        ROOT / "ReturnReports" / "CRD.csv",
        ROOT.parent / "AuourLLM" / "ReturnReports" / "CRD.csv",
    ]
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    raise FileNotFoundError(
        "CRD.csv not found. Pass --csv or place the file in ReturnReports/CRD.csv"
    )


def _load_env() -> None:
    try:
        from dotenv import load_dotenv
    except ImportError:
        return
    load_dotenv(ROOT / ".env")


def load_database_advisors() -> Dict[str, Dict[str, object]]:
    from sqlalchemy import func

    from backend.api.models.database import MonitoredAccount
    from backend.database.connection import get_session_local

    session = get_session_local()()
    try:
        rows = (
            session.query(
                func.trim(MonitoredAccount.advisor),
                MonitoredAccount.advisor_crd,
                func.count(),
            )
            .filter(MonitoredAccount.advisor.isnot(None))
            .filter(func.trim(MonitoredAccount.advisor) != "")
            .group_by(func.trim(MonitoredAccount.advisor), MonitoredAccount.advisor_crd)
            .all()
        )
    finally:
        session.close()

    grouped: Dict[str, Dict[str, object]] = {}
    for advisor, crd, count in rows:
        name = (advisor or "").strip()
        bucket = grouped.setdefault(name, {"count": 0, "blank": 0, "crds": set()})
        bucket["count"] = int(bucket["count"]) + int(count)
        if crd and str(crd).strip():
            bucket["crds"].add(str(crd).strip())
        else:
            bucket["blank"] = int(bucket["blank"]) + int(count)
    return grouped


def apply_matches(matches: Sequence[NameMatch]) -> int:
    """Write CRD onto every monitored account whose adviser name was accepted."""
    from sqlalchemy import func

    from backend.api.models.database import MonitoredAccount
    from backend.database.connection import get_session_local

    accepted = {
        match.db_advisor: match.crd
        for match in matches
        if match.decision == "apply" and match.crd
    }
    if not accepted:
        return 0

    session = get_session_local()()
    updated = 0
    try:
        accounts = (
            session.query(MonitoredAccount)
            .filter(MonitoredAccount.advisor.isnot(None))
            .all()
        )
        for account in accounts:
            key = (account.advisor or "").strip()
            crd = accepted.get(key)
            if not crd:
                continue
            current = (account.advisor_crd or "").strip()
            if current == crd:
                continue
            if current and current != crd:
                continue
            account.advisor_crd = crd
            updated += 1
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
    return updated


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Populate monitored account Advisor CRD from CRD.csv")
    parser.add_argument("--csv", help="Path to CRD.csv")
    parser.add_argument("--report", help="Where to write the match report CSV")
    parser.add_argument("--apply", action="store_true", help="Write high-confidence CRDs to the database")
    parser.add_argument("--min-confidence", type=int, default=DEFAULT_MIN_CONFIDENCE)
    parser.add_argument("--min-gap", type=int, default=DEFAULT_MIN_GAP)
    args = parser.parse_args(argv)

    csv_path = resolve_csv_path(args.csv)
    report_path = Path(args.report) if args.report else csv_path.with_name("CRD_match_report.csv")
    file_advisers = load_file_advisers(csv_path)

    _load_env()
    db_advisors = load_database_advisors()
    matches = match_advisers(
        db_advisors,
        file_advisers,
        min_confidence=args.min_confidence,
        min_gap=args.min_gap,
    )
    write_report(report_path, matches)
    counts = summarize(matches)
    print(f"File advisers: {len(file_advisers)}")
    print(f"Database adviser names: {len(db_advisors)}")
    for decision in ("apply", "unchanged", "review", "ambiguous", "conflict", "unmatched"):
        print(f"  {decision}: {counts.get(decision, 0)}")
    print(f"Report: {report_path}")

    if args.apply:
        updated = apply_matches(matches)
        print(f"Accounts updated: {updated}")
    else:
        print("Dry run only. Re-run with --apply to write CRDs for the apply rows.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
