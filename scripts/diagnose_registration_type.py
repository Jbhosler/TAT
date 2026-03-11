#!/usr/bin/env python3
"""
Diagnostic script: compare Aggregated Holdings and Registration Type files
to find why synthetic_id (account ID) does not match between them.

Standalone - no backend imports required. Run from project root:
  python scripts/diagnose_registration_type.py
"""
import csv
import hashlib
import io
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent


def _normalize_header(name: str) -> str:
    if not name:
        return ""
    return name.strip().strip("\ufeff")


def _synthetic_id(account: str, advisor: str, model: str, firm: str, enterprise: str) -> str:
    raw = f"{account}|{advisor}|{model}|{firm}|{enterprise}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]


def _aggregated_header_indices(headers: list) -> dict:
    """Match aggregated holdings columns: account, advisor, model, firm, enterprise."""
    normalized = [_normalize_header(h).strip().lower() for h in headers]
    result = {"account": -1, "advisor": -1, "model": -1, "firm": -1, "enterprise": -1}
    name_to_key = [
        ("account", ["account"]),
        ("advisor", ["advisor", "adviser"]),
        ("model", ["model"]),
        ("firm", ["firm"]),
        ("enterprise", ["enterprise"]),
    ]
    for i, norm in enumerate(normalized):
        if not norm:
            continue
        for key, aliases in name_to_key:
            if result[key] >= 0:
                continue
            for al in aliases:
                if al in norm or norm.startswith(al) or (al.replace(" ", "") in norm.replace(" ", "")):
                    result[key] = i
                    break
    return result


def _registration_header_indices(headers: list) -> dict:
    """Match registration type columns: account, advisor, model, firm, enterprise, account_number, registration_type."""
    normalized = [_normalize_header(h).strip().lower() for h in headers]
    result = {
        "account": -1, "advisor": -1, "model": -1, "firm": -1, "enterprise": -1,
        "account_number": -1, "registration_type": -1,
    }
    name_to_key = [
        ("account", ["account", "account id"]),
        ("advisor", ["advisor", "adviser"]),
        ("model", ["model", "product", "program"]),
        ("firm", ["firm"]),
        ("enterprise", ["enterprise"]),
        ("account_number", ["account number", "accountnumber"]),
        ("registration_type", ["registration type", "registration", "reg type", "regtype"]),
    ]
    for i, norm in enumerate(normalized):
        if not norm:
            continue
        for key, aliases in name_to_key:
            if result[key] >= 0:
                continue
            for al in aliases:
                if al in norm or norm.startswith(al) or (al.replace(" ", "") in norm.replace(" ", "")):
                    result[key] = i
                    break
    return result


def _cell(row: list, idx: int) -> str:
    if idx < 0 or idx >= len(row):
        return ""
    return (row[idx] or "").strip()


def _extract_last4(s: str) -> str:
    if not s or not isinstance(s, str):
        return ""
    digits = "".join(c for c in s if c.isdigit())
    return digits[-4:] if len(digits) >= 4 else digits


def _account_variants_for_hash(account_number: str, account_id: str) -> list:
    """Aggregated uses both *****1234 and ****1234 - try both."""
    last4 = _extract_last4(account_number) or _extract_last4(account_id)
    if not last4:
        base = account_id or account_number or ""
        return [base] if base else []
    return ["*****" + last4, "****" + last4]


def _format_advisor_for_hash(advisor: str) -> str:
    if not advisor or not isinstance(advisor, str):
        return advisor or ""
    parts = advisor.strip().split()
    if len(parts) <= 1:
        return advisor.strip()
    first, last = parts[0], " ".join(parts[1:])
    return f"{last}, {first}"


FIRM_MAP = {
    "cetera wealth services, llc": "Cetera Wealth Svcs",
    "cetera wealth services": "Cetera Wealth Svcs",
    "cetera financial specialists llc": "Specialists",
    "cetera financial specialists": "Specialists",
    "cetera investment services llc": "Institutions",
    "cetera investment services": "Institutions",
    "cetera advisors llc": "Advisors",
    "cetera advisors": "Advisors",
}


def _format_firm_for_hash(firm: str) -> str:
    if not firm or not isinstance(firm, str):
        return firm or ""
    return FIRM_MAP.get(firm.strip().lower(), firm.strip())


def parse_aggregated(csv_content: str) -> list:
    """Parse aggregated holdings, return list of {synthetic_id, account, advisor, model, firm, enterprise}."""
    content = (csv_content or "").strip().strip("\ufeff").replace("\r\n", "\n").replace("\r", "\n")
    lines = list(csv.reader(io.StringIO(content)))
    if not lines:
        return []
    headers = lines[0]
    indices = _aggregated_header_indices(headers)
    rows_by_id = {}
    for row in lines[1:]:
        if len(row) < 2 or not any(str(v).strip() for v in row):
            continue
        account = _cell(row, indices["account"])
        advisor = _cell(row, indices["advisor"])
        model = _cell(row, indices["model"])
        firm = _cell(row, indices["firm"])
        enterprise = _cell(row, indices["enterprise"])
        sid = _synthetic_id(account, advisor, model, firm, enterprise)
        if sid not in rows_by_id:
            rows_by_id[sid] = {
                "synthetic_id": sid,
                "account": account,
                "advisor": advisor,
                "model": model,
                "firm": firm,
                "enterprise": enterprise,
            }
    return list(rows_by_id.values())


def parse_registration(csv_content: str) -> list:
    """Parse registration type, return list of {synthetic_id, account, advisor, model, firm, enterprise, last4, registration_type}."""
    content = (csv_content or "").strip().strip("\ufeff").replace("\r\n", "\n").replace("\r", "\n")
    lines = list(csv.reader(io.StringIO(content)))
    if not lines:
        return []
    headers = lines[0]
    indices = _registration_header_indices(headers)
    valid_types = {"retirement", "taxable", "trust"}
    result = []
    for row in lines[1:]:
        if len(row) < 2 or not any(str(v).strip() for v in row):
            continue
        reg_raw = _cell(row, indices["registration_type"])
        if not reg_raw or reg_raw.strip().lower() not in valid_types:
            continue
        account_id = _cell(row, indices["account"])
        acc_num = _cell(row, indices["account_number"])
        advisor_raw = _cell(row, indices["advisor"])
        model = _cell(row, indices["model"])
        firm_raw = _cell(row, indices["firm"])
        enterprise = _cell(row, indices["enterprise"])
        advisor = _format_advisor_for_hash(advisor_raw)
        firm = _format_firm_for_hash(firm_raw)
        last4 = _extract_last4(acc_num) or _extract_last4(account_id)
        account_variants = _account_variants_for_hash(acc_num, account_id)
        if not account_variants:
            account_variants = [account_id or acc_num or ""]
        # Use first variant for display; matching checks all
        sid = _synthetic_id(account_variants[0], advisor, model, firm, enterprise)
        result.append({
            "synthetic_id": sid,
            "account": account_variants[0],
            "advisor": advisor,
            "model": model,
            "firm": firm,
            "enterprise": enterprise,
            "last4": last4,
            "registration_type": reg_raw.strip(),
        })
    return result


def main():
    agg_path = SCRIPT_DIR / "Aggregate Holdings File.csv"
    reg_path = SCRIPT_DIR / "Registration Type File.csv"

    if not agg_path.exists():
        print(f"ERROR: Aggregated holdings file not found: {agg_path}")
        sys.exit(1)
    if not reg_path.exists():
        print(f"ERROR: Registration type file not found: {reg_path}")
        sys.exit(1)

    print("=" * 75)
    print("Registration Type Matching Diagnostic")
    print("=" * 75)
    print()

    def read_csv(path: Path) -> str:
        for enc in ("utf-8-sig", "cp1252", "latin-1"):
            try:
                return path.read_text(encoding=enc)
            except UnicodeDecodeError:
                continue
        return path.read_text(encoding="utf-8-sig", errors="replace")

    agg_content = read_csv(agg_path)
    reg_content = read_csv(reg_path)

    agg_groups = parse_aggregated(agg_content)
    reg_rows = parse_registration(reg_content)

    agg_by_sid = {g["synthetic_id"]: g for g in agg_groups}
    # Registration: try both ***** and **** account formats
    reg_matched_sids = set()
    for r in reg_rows:
        adv = r.get("advisor", "")
        mod = r.get("model", "")
        firm = r.get("firm", "")
        ent = r.get("enterprise", "")
        last4 = r.get("last4", "")
        for acc in (["*****" + last4, "****" + last4] if last4 else []):
            sid = _synthetic_id(acc, adv, mod, firm, ent)
            if sid in agg_by_sid:
                reg_matched_sids.add(sid)
                break

    overlap_count = len(reg_matched_sids)
    print("SUMMARY")
    print("-" * 75)
    print(f"Aggregated holdings: {len(agg_groups)} unique accounts")
    print(f"Registration type:   {len(reg_rows)} rows with valid Registration Type")
    print(f"Matching (same synthetic_id): {overlap_count} registration rows")
    print(f"Only in aggregated:  {len(agg_groups) - overlap_count} (approx)")
    print(f"Registration rows not matched: {len(reg_rows) - overlap_count}")
    print()

    # Column mapping
    print("COLUMN MAPPING")
    print("-" * 75)
    agg_headers = list(csv.reader(io.StringIO(agg_content)))[0]
    reg_headers = list(csv.reader(io.StringIO(reg_content)))[0]
    agg_idx = _aggregated_header_indices(agg_headers)
    reg_idx = _registration_header_indices(reg_headers)
    print("Aggregated  -> account:", agg_headers[agg_idx["account"]] if agg_idx["account"] >= 0 else "NOT FOUND",
          "| advisor:", agg_headers[agg_idx["advisor"]] if agg_idx["advisor"] >= 0 else "NOT FOUND",
          "| model:", agg_headers[agg_idx["model"]] if agg_idx["model"] >= 0 else "NOT FOUND",
          "| firm:", agg_headers[agg_idx["firm"]] if agg_idx["firm"] >= 0 else "NOT FOUND",
          "| enterprise:", agg_headers[agg_idx["enterprise"]] if agg_idx["enterprise"] >= 0 else "NOT FOUND")
    print("Registration-> account:", reg_headers[reg_idx["account"]] if reg_idx["account"] >= 0 else "NOT FOUND",
          "| advisor:", reg_headers[reg_idx["advisor"]] if reg_idx["advisor"] >= 0 else "NOT FOUND",
          "| model:", reg_headers[reg_idx["model"]] if reg_idx["model"] >= 0 else "NOT FOUND",
          "| firm:", reg_headers[reg_idx["firm"]] if reg_idx["firm"] >= 0 else "NOT FOUND",
          "| enterprise:", reg_headers[reg_idx["enterprise"]] if reg_idx["enterprise"] >= 0 else "NOT FOUND")
    print()

    # Sample comparison - side by side
    print("SAMPLE VALUES (Account | Advisor | Model | Firm | Enterprise)")
    print("-" * 75)
    print("\nAGGREGATED HOLDINGS (first 3 unique accounts):")
    for i, g in enumerate(agg_groups[:3], 1):
        print(f"  {i}. Account={g['account']!r}")
        print(f"     Advisor={g['advisor']!r}")
        print(f"     Model={g['model']!r}")
        print(f"     Firm={g['firm']!r}")
        print(f"     Enterprise={g['enterprise']!r}")
        print(f"     synthetic_id={g['synthetic_id'][:20]}...")

    print("\nREGISTRATION TYPE (first 3 rows):")
    for i, r in enumerate(reg_rows[:3], 1):
        print(f"  {i}. Account={r['account']!r}  (last4={r['last4']!r})")
        print(f"     Advisor={r['advisor']!r}")
        print(f"     Model={r['model']!r}")
        print(f"     Firm={r['firm']!r}")
        print(f"     Enterprise={r['enterprise']!r}")
        print(f"     synthetic_id={r['synthetic_id'][:20]}...")

    # Potential matches by last4 + model
    print("\n" + "-" * 75)
    print("POTENTIAL MATCHES BY last4 + Model (same person, different formats)")
    print("-" * 75)
    agg_by_last4_model = {}
    for g in agg_groups:
        digits = "".join(c for c in g["account"] if c.isdigit())
        last4 = digits[-4:] if len(digits) >= 4 else ""
        if last4:
            key = (last4, (g["model"] or "").strip().lower())
            if key not in agg_by_last4_model:
                agg_by_last4_model[key] = g

    matches = 0
    examples = []
    for r in reg_rows:
        last4 = r.get("last4", "")
        model = (r.get("model") or "").strip().lower()
        if last4 and model and (last4, model) in agg_by_last4_model:
            matches += 1
            if len(examples) < 2:
                agg = agg_by_last4_model[(last4, model)]
                examples.append((r, agg))

    print(f"  {matches} registration rows could match by last4+model (same account, different field formats)")
    if examples:
        print("\n  Example - same account, different formats:")
        for r, a in examples:
            print(f"    Registration: Account={r['account']!r} Advisor={r['advisor']!r} Firm={r['firm']!r}")
            print(f"    Aggregated:   Account={a['account']!r} Advisor={a['advisor']!r} Firm={a['firm']!r}")

    # Diagnosis
    print("\n" + "=" * 75)
    print("DIAGNOSIS")
    print("=" * 75)
    print("synthetic_id = hash(Account | Advisor | Model | Firm | Enterprise)")
    print("All 5 values must match EXACTLY.")
    print()
    print("LIKELY CAUSES OF MISMATCH:")
    print("  1. ACCOUNT: Aggregated uses masked (****5177); Registration uses Account ID (cetera-1022796)")
    print("  2. ADVISOR: Aggregated uses 'Last, First'; Registration uses 'First Last'")
    print("  3. FIRM: Aggregated uses abbreviated ('Cetera Wealth Svcs'); Registration uses full ('Cetera Wealth Services, LLC')")
    print()
    print("RECOMMENDATION: Transform Registration file to use the SAME values as")
    print("Aggregated Holdings before upload. Build a mapping or re-export from same source.")
    print()


if __name__ == "__main__":
    main()
