"""
CSV parsing utilities for Strategy, Prospect, Product Equivalents, and Monitoring aggregated holdings.
"""
import csv
import io
import hashlib
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional
from decimal import Decimal
from backend.api.models.schemas import (
    BulkStrategyUpload,
    ProspectCSVRow,
    ProductEquivalentCSVRow
)
from backend.api.models.database import AssetClass

logger = logging.getLogger(__name__)


def parse_strategy_bulk_upload(csv_content: str) -> List[Dict[str, Any]]:
    """
    Parse Strategy bulk upload CSV.
    Format: Strategy Name, Model Ticker, Asset Class, Target %, Drift %
    
    Args:
        csv_content: CSV file content as string
        
    Returns:
        List of strategy position dictionaries grouped by strategy name
    """
    reader = csv.DictReader(io.StringIO(csv_content))
    
    strategies = {}
    
    for row in reader:
        strategy_name = row['Strategy Name'].strip()
        model_ticker = row['Model Ticker'].strip()
        asset_class_str = row['Asset Class'].strip()
        target_allocation = Decimal(row['Target %'].strip())
        drift_percentage = Decimal(row['Drift %'].strip())
        
        # Validate asset class
        try:
            asset_class = AssetClass(asset_class_str)
        except ValueError:
            raise ValueError(f"Invalid asset class: {asset_class_str}")
        
        # Validate precision (0.1%)
        target_allocation = round(target_allocation, 3)
        drift_percentage = round(drift_percentage, 3)
        
        if strategy_name not in strategies:
            strategies[strategy_name] = {
                'name': strategy_name,
                'positions': []
            }
        
        strategies[strategy_name]['positions'].append({
            'model_ticker': model_ticker,
            'asset_class': asset_class,
            'target_allocation': target_allocation,
            'drift_percentage': drift_percentage
        })
    
    return list(strategies.values())


def _parse_prospect_amount(s: str) -> Decimal:
    """Parse amount string: strip $ and commas, treat (1,234.56) as negative, empty/N/A as 0."""
    if not s or not isinstance(s, str):
        return Decimal("0")
    s = s.strip().replace("$", "").replace(",", "").strip()
    if not s or s.upper() in ("N/A", "NA", "-", "--", ""):
        return Decimal("0")
    # Accounting format: (123.45) means -123.45
    if s.startswith("(") and s.endswith(")"):
        s = "-" + s[1:-1].strip()
    try:
        return Decimal(s)
    except Exception:
        return Decimal("0")


def parse_prospect_csv(csv_content: str) -> List[Dict[str, Any]]:
    """
    Parse Prospect CSV.
    Format: Ticker, Value ($), Unrealized Gain/Loss ($) — headers flexible (case-insensitive, BOM stripped).
    Skips rows with empty ticker. Tolerates bad/missing numbers (treats as 0).
    """
    csv_content = (csv_content or "").strip().strip("\ufeff")
    if not csv_content:
        return []
    # Normalize line endings so DictReader sees one row per line (avoids \\r-only or mixed \\r\\n/\\n)
    csv_content = csv_content.replace("\r\n", "\n").replace("\r", "\n")

    reader = csv.DictReader(io.StringIO(csv_content))
    holdings = []

    for row in reader:
        if not any(v is not None and str(v).strip() for v in row.values()):
            continue
        try:
            ticker = _get_column(row, ["Ticker", "ticker", "Symbol", "symbol"])
        except KeyError:
            continue
        if not ticker:
            continue
        try:
            value_str = _get_column_optional(row, ["Value ($)", "Value", "value"], "0")
            gain_loss_str = _get_column_optional(row, ["Unrealized Gain/Loss ($)", "Unrealized Gain/Loss", "Gain/Loss", "Unrealized", "unrealized"], "0")
            value = _parse_prospect_amount(str(value_str))
            unrealized_gain_loss = _parse_prospect_amount(str(gain_loss_str))
        except Exception:
            # Skip row on any parse error so one bad row doesn't stop the whole upload
            continue
        holdings.append({
            "ticker": ticker,
            "value": value,
            "unrealized_gain_loss": unrealized_gain_loss,
        })

    return holdings


def _normalize_header(name: str) -> str:
    """Strip BOM and whitespace for case-insensitive header matching."""
    if not name:
        return ""
    s = name.strip().strip("\ufeff")
    return s


def _get_column(row: dict, possible_names: list) -> str:
    """Get value from row using first matching column name (case-insensitive)."""
    row_lower = {_normalize_header(k).lower(): (k, v) for k, v in row.items()}
    for name in possible_names:
        key = name.lower().strip()
        if key in row_lower:
            _, val = row_lower[key]
            return (val or "").strip()
    raise KeyError(f"Expected one of columns: {possible_names}. Found: {list(row.keys())}")


def _get_column_optional(row: dict, possible_names: list, default: str = "") -> str:
    """Like _get_column but returns default if no column matches."""
    row_lower = {_normalize_header(k).lower(): (k, v) for k, v in row.items()}
    for name in possible_names:
        key = name.lower().strip()
        if key in row_lower:
            _, val = row_lower[key]
            return (val or "").strip()
    return default


def _detect_csv_delimiter(first_line: str) -> str:
    """Use semicolon if it appears more than comma in header (Excel locale)."""
    if not first_line:
        return ","
    comma_count = first_line.count(",")
    semicolon_count = first_line.count(";")
    return ";" if semicolon_count > comma_count else ","


def parse_product_equivalents_csv(csv_content: str) -> List[Dict[str, Any]]:
    """
    Parse Product Equivalents CSV.
    Format: Ticker, Alternate, Buy Control, Sell Control, Custodian, Notes, Description.
    Optional: Legacy Ticker, Model Ticker (alternate mapping). Grade is optional; NULL = set in app.
    Supports comma or semicolon delimiter (Excel locale).
    
    Column mapping:
    - Ticker or Model Ticker -> model_ticker
    - Alternate or Legacy Ticker -> legacy_ticker
    - Buy Control, Sell Control, Custodian, Notes, Description -> stored as-is
    """
    csv_content = (csv_content or "").strip().strip("\ufeff")
    if not csv_content:
        return []

    lines = csv_content.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    delimiter = _detect_csv_delimiter(lines[0] if lines else "")
    reader = csv.DictReader(io.StringIO(csv_content), delimiter=delimiter)
    equivalents = []

    for row in reader:
        if not any(v and str(v).strip() for v in row.values()):
            continue
        # Ticker = model ticker (strategy position), Alternate = legacy ticker (equivalent)
        # Also support Legacy Ticker / Model Ticker format
        model_ticker = _get_column_optional(row, ["Ticker", "Model Ticker", "model_ticker"])
        legacy_ticker = _get_column_optional(row, ["Alternate", "Legacy Ticker", "legacy_ticker"])
        if not model_ticker or not legacy_ticker:
            raise KeyError("Both Ticker (or Model Ticker) and Alternate (or Legacy Ticker) are required.")
        buy_control = _get_column_optional(row, ["Buy Control", "buy_control"])
        sell_control = _get_column_optional(row, ["Sell Control", "sell_control"])
        custodian = _get_column_optional(row, ["Custodian", "custodian"])
        notes = _get_column_optional(row, ["Notes", "notes"])
        description = _get_column_optional(row, ["Description", "description"])
        grade_str = _get_column_optional(row, ["Grade", "grade"])
        if grade_str:
            try:
                grade = int(grade_str)
            except ValueError:
                raise ValueError(f"Grade must be a number (0, 1, or 2). Got: {grade_str!r}")
            if grade not in [0, 1, 2]:
                raise ValueError(f"Invalid grade: {grade}. Must be 0, 1, or 2.")
        else:
            grade = None  # User sets grade in app
        equivalents.append({
            "legacy_ticker": legacy_ticker,
            "model_ticker": model_ticker,
            "grade": grade,
            "buy_control": buy_control or None,
            "sell_control": sell_control or None,
            "custodian": custodian or None,
            "notes": notes or None,
            "description": description or None,
        })

    return equivalents


def _parse_aggregated_amount(s: str) -> Decimal:
    """Parse a non-negative monitoring amount; empty/N/A values are treated as 0."""
    if not s or not isinstance(s, str):
        return Decimal("0")
    s = str(s).strip().replace(",", "").replace("$", "").strip()
    if not s or s.upper() in ("N/A", "NA", "-", "--", ""):
        return Decimal("0")
    if s.startswith("(") and s.endswith(")"):
        raise ValueError(f"Negative monitoring amount is not allowed: {s}")
    try:
        amount = Decimal(s)
    except Exception as exc:
        raise ValueError(f"Invalid monitoring amount: {s}") from exc
    if amount < 0:
        raise ValueError(f"Negative monitoring amount is not allowed: {s}")
    return amount


def _parse_as_of_date(s: str) -> Optional[datetime]:
    """Parse common As Of Date formats. Returns datetime or None."""
    if not s or not isinstance(s, str):
        return None
    s = str(s).strip()
    if not s:
        return None
    for fmt in ("%d-%b-%y", "%d-%b-%Y", "%b %d, %Y", "%b %d, %y", "%m/%d/%Y", "%m/%d/%y"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None


def _aggregated_get_column(row: dict, possible_names: List[str]) -> str:
    """First matching column (case-insensitive; matches truncated headers)."""
    row_lower = {_normalize_header(k).lower(): (k, v) for k, v in row.items()}
    for name in possible_names:
        key = name.lower().strip()
        if key in row_lower:
            _, val = row_lower[key]
            return (val or "").strip()
        for k in row_lower:
            if k.startswith(key) or key.startswith(k):
                _, val = row_lower[k]
                return (val or "").strip()
    raise KeyError(f"Expected one of: {possible_names}. Found: {list(row.keys())}")


def _aggregated_get_column_optional(row: dict, possible_names: List[str], default: str = "") -> str:
    """Like _aggregated_get_column but returns default if no match."""
    try:
        return _aggregated_get_column(row, possible_names)
    except KeyError:
        return default


def _first_market_val_column(row: dict) -> str:
    """Return value of first Market Val column (duplicate columns: use first occurrence)."""
    candidates = ["market val", "market value(actual)", "market value (actual)", "market value"]
    for k, v in row.items():
        norm = _normalize_header(k).lower()
        for c in candidates:
            if c in norm or norm in c or norm.startswith("market"):
                return (v or "").strip()
    return "0"


def _aggregated_header_indices(headers: List[str]) -> Dict[str, int]:
    """
    Return column index for each logical column. For 'market_val' use first matching index
    so duplicate 'Market Val' columns use the first occurrence.
    """
    normalized = [_normalize_header(h).strip().lower() for h in headers]
    result: Dict[str, Any] = {
        "account": None, "advisor": None, "model": None, "firm": None, "enterprise": None,
        "market_val": None, "cash": None, "ticker": None, "as_of_date": None,
    }
    market_candidates = ["market val", "market value(actual)", "market value (actual)", "market value"]
    cash_candidates = ["cash as position", "cash as po"]
    name_to_key = [
        ("account", ["account"]),
        ("advisor", ["advisor", "adviser"]),
        ("model", ["model"]),
        ("firm", ["firm"]),
        ("enterprise", ["enterprise"]),
        ("ticker", ["ticker"]),
        ("as_of_date", ["as of date"]),
    ]
    for i, norm in enumerate(normalized):
        if not norm:
            continue
        for mc in market_candidates:
            if mc in norm or norm in mc or (norm.startswith("market") and "val" in norm):
                if result["market_val"] is None:
                    result["market_val"] = i
                break
        for cc in cash_candidates:
            if cc in norm or norm in cc or (norm.startswith("cash") and "position" in norm) or (norm.startswith("cash") and "po" in norm):
                if result["cash"] is None:
                    result["cash"] = i
                break
        for key, aliases in name_to_key:
            if result[key] is not None:
                continue
            for al in aliases:
                if al in norm or norm.startswith(al) or (al.replace(" ", "") in norm.replace(" ", "")):
                    result[key] = i
                    break
    return {k: (v if v is not None else -1) for k, v in result.items()}


def _synthetic_id(account: str, advisor: str, model: str, firm: str, enterprise: str) -> str:
    """Deterministic hash for synthetic account ID."""
    raw = f"{account}|{advisor}|{model}|{firm}|{enterprise}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]


def _normalize_aggregated_text(value: str) -> str:
    """Collapse repeated whitespace without changing display casing."""
    return " ".join(str(value or "").strip().split())


def parse_aggregated_holdings_csv(csv_content: str) -> List[Dict[str, Any]]:
    """
    Parse aggregated holdings CSV (e.g. rows6923.csv) for Monitoring ingest.

    Groups by synthetic_id = hash(Account + Advisor + Model + Firm + Enterprise).
    Validates cash consistency per group; non-compounding total = sum(Market Val) + single Cash As Position.
    Uses flexible headers (e.g. Cash As Po, Descriptio, Market Val). As Of Date parsed as DD-Mon-YY.

    Returns:
        List of {
            synthetic_id, external_model_name, cash_value, total_value, as_of_date,
            holdings: [{ticker, value}], data_inconsistency: bool
        }
    """
    csv_content = (csv_content or "").strip().strip("\ufeff")
    csv_content = csv_content.replace("\r\n", "\n").replace("\r", "\n")
    if not csv_content:
        return []

    lines = list(csv.reader(io.StringIO(csv_content)))
    if not lines:
        return []
    headers = lines[0]
    indices = _aggregated_header_indices(headers)
    rows_by_id: Dict[str, List[Dict[str, Any]]] = {}

    def _cell(row: List[str], key: str) -> str:
        idx = indices.get(key, -1)
        if idx < 0 or idx >= len(row):
            return ""
        return (row[idx] or "").strip()

    for row in lines[1:]:
        if len(row) < 2 or not any(str(v).strip() for v in row):
            continue
        account = _normalize_aggregated_text(_cell(row, "account"))
        advisor = _normalize_aggregated_text(_cell(row, "advisor"))
        model = _normalize_aggregated_text(_cell(row, "model"))
        firm = _normalize_aggregated_text(_cell(row, "firm"))
        enterprise = _normalize_aggregated_text(_cell(row, "enterprise"))
        if not account:
            raise ValueError("Monitoring CSV row is missing Account.")
        if not model:
            raise ValueError(f"Monitoring CSV row for account {account} is missing Model.")
        if not advisor:
            raise ValueError(f"Monitoring CSV row for account {account} / model {model} is missing Advisor.")
        if not firm:
            raise ValueError(f"Monitoring CSV row for account {account} / model {model} is missing Firm.")
        if not enterprise:
            raise ValueError(f"Monitoring CSV row for account {account} / model {model} is missing Enterprise.")
        sid = _synthetic_id(account, advisor, model, firm, enterprise)
        if sid not in rows_by_id:
            rows_by_id[sid] = []
        market_val_str = _cell(row, "market_val") or "0"
        cash_str = _cell(row, "cash") or "0"
        ticker = _cell(row, "ticker")
        as_of_date_str = _cell(row, "as_of_date")
        rows_by_id[sid].append({
            "account": account,
            "advisor": advisor,
            "model": model,
            "firm": firm,
            "enterprise": enterprise,
            "market_val_str": market_val_str,
            "cash_str": cash_str,
            "ticker": ticker,
            "as_of_date_str": as_of_date_str,
        })

    logger.info("Aggregated CSV: %s rows, %s synthetic_id groups", sum(len(r) for r in rows_by_id.values()), len(rows_by_id))

    result = []
    for synthetic_id, group in rows_by_id.items():
        if not group:
            continue
        external_model_name = (group[0].get("model") or "").strip()
        as_of_date = None
        for r in group:
            d = _parse_as_of_date(r.get("as_of_date_str") or "")
            if d:
                as_of_date = d.date()
                break

        account_display = (group[0].get("account") or "").strip()
        advisor = (group[0].get("advisor") or "").strip()
        firm = (group[0].get("firm") or "").strip()

        cash_values = [_parse_aggregated_amount(r.get("cash_str") or "0") for r in group]
        if len(set(cash_values)) > 1:
            result.append({
                "synthetic_id": synthetic_id,
                "external_model_name": external_model_name,
                "account_display": account_display,
                "advisor": advisor,
                "firm": firm,
                "cash_value": cash_values[0],
                "total_value": Decimal("0"),
                "as_of_date": as_of_date,
                "holdings": [],
                "data_inconsistency": True,
                "data_inconsistency_reason": (
                    "Cash As Position differs within account group "
                    f"{account_display} / {advisor} / {external_model_name}: "
                    f"{', '.join(str(v) for v in sorted(set(cash_values)))}"
                ),
                "cash_values": sorted(set(cash_values)),
            })
            continue

        cash_value = cash_values[0] if cash_values else Decimal("0")
        holdings = []
        for r in group:
            ticker = (r.get("ticker") or "").strip()
            val = _parse_aggregated_amount(r.get("market_val_str") or "0")
            if not ticker and val > 0:
                raise ValueError(
                    f"Monitoring CSV row for account {account_display} / model {external_model_name} "
                    "has Market Value but no Ticker."
                )
            if ticker and val > 0:
                holdings.append({"ticker": ticker, "value": val})
        sum_market_val = sum(h["value"] for h in holdings)
        total_value = sum_market_val + cash_value

        result.append({
            "synthetic_id": synthetic_id,
            "external_model_name": external_model_name,
            "account_display": account_display,
            "advisor": advisor,
            "firm": firm,
            "cash_value": cash_value,
            "total_value": total_value,
            "as_of_date": as_of_date,
            "holdings": holdings,
            "data_inconsistency": False,
        })

    return result


def _extract_last4(s: str) -> str:
    """Extract last 4 digits from account number (e.g. xxx-5290 -> 5290, ****5038 -> 5038)."""
    if not s or not isinstance(s, str):
        return ""
    digits = "".join(c for c in s if c.isdigit())
    return digits[-4:] if len(digits) >= 4 else digits


def _format_account_for_hash(account_number: str, account_id: str) -> str:
    """
    Format account to match aggregated holdings (*****1234 or ****1234).
    Uses Account Number if available; otherwise last 4 from Account ID.
    Aggregated file uses both 4 and 5 asterisks - we default to 5.
    """
    last4 = _extract_last4(account_number) or _extract_last4(account_id)
    if not last4:
        return account_id or account_number or ""
    return "*****" + last4


def _account_variants_for_hash(account_number: str, account_id: str) -> List[str]:
    """
    Return account value variants to try for synthetic_id matching.
    Aggregated holdings uses both *****1234 (5 asterisks) and ****1234 (4 asterisks).
    """
    last4 = _extract_last4(account_number) or _extract_last4(account_id)
    if not last4:
        base = account_id or account_number or ""
        return [base] if base else []
    return ["*****" + last4, "****" + last4]


def _format_advisor_for_hash(advisor: str) -> str:
    """
    Convert 'First Last' or 'First LAST' to 'Last, First' to match aggregated holdings.
    """
    if not advisor or not isinstance(advisor, str):
        return advisor or ""
    parts = advisor.strip().split()
    if len(parts) <= 1:
        return advisor.strip()
    first = parts[0]
    last = " ".join(parts[1:])
    return f"{last}, {first}"


# Registration Firm (full name) -> Aggregated Firm (abbreviated)
_REGISTRATION_FIRM_TO_AGGREGATED: Dict[str, str] = {
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
    """
    Normalize firm name to match aggregated holdings format.
    """
    if not firm or not isinstance(firm, str):
        return firm or ""
    key = firm.strip().lower()
    return _REGISTRATION_FIRM_TO_AGGREGATED.get(key, firm.strip())


def _registration_type_header_indices(headers: List[str]) -> Dict[str, int]:
    """
    Return column index for registration-type CSV. Matches columns used for synthetic_id
    plus Registration Type and Advisor CRD. Supports: Adviser, Account, Product/Program/Model,
    Firm, Enterprise, Account Number, Registration Type, Advisor CRD.
    """
    normalized = [_normalize_header(h).strip().lower() for h in headers]
    result: Dict[str, Any] = {
        "account": None, "advisor": None, "model": None, "firm": None, "enterprise": None,
        "account_number": None, "registration_type": None, "advisor_crd": None,
    }
    # Claim CRD before adviser matching so "Advisor CRD" does not steal the adviser name.
    for i, norm in enumerate(normalized):
        if norm and "crd" in norm:
            result["advisor_crd"] = i
            break
    name_to_key = [
        ("account", ["account"]),
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
        if result["advisor_crd"] is not None and i == result["advisor_crd"]:
            continue
        for key, aliases in name_to_key:
            if result[key] is not None:
                continue
            for al in aliases:
                if al in norm or norm.startswith(al) or (al.replace(" ", "") in norm.replace(" ", "")):
                    result[key] = i
                    break
    return {k: (v if v is not None else -1) for k, v in result.items()}


def parse_registration_type_csv(csv_content: str) -> List[Dict[str, Any]]:
    """
    Parse registration type CSV for updating monitored accounts.

    Expects columns that match the synthetic_id components: Account, Adviser, Product/Model, Firm, Enterprise,
    plus Registration Type (Retirement, Taxable, Trust) and Advisor CRD. Uses same hash as
    aggregated holdings: synthetic_id = hash(account|advisor|model|firm|enterprise).

    Returns:
        List of {synthetic_id, registration_type, advisor_crd, ...}. Rows with a valid
        registration type and/or a CRD are included so CRD is not dropped when
        Registration Type is blank.
    """
    csv_content = (csv_content or "").strip().strip("\ufeff")
    csv_content = csv_content.replace("\r\n", "\n").replace("\r", "\n")
    if not csv_content:
        return []

    lines = list(csv.reader(io.StringIO(csv_content)))
    if not lines:
        return []

    headers = lines[0]
    indices = _registration_type_header_indices(headers)

    valid_types = {"retirement", "taxable", "trust"}
    result: List[Dict[str, Any]] = []

    def _cell(row: List[str], key: str) -> str:
        idx = indices.get(key, -1)
        if idx < 0 or idx >= len(row):
            return ""
        return (row[idx] or "").strip()

    for row in lines[1:]:
        if len(row) < 2 or not any(str(v).strip() for v in row):
            continue
        reg_type_raw = _cell(row, "registration_type")
        crd = _cell(row, "advisor_crd").strip()
        reg_type = None
        if reg_type_raw:
            reg_type_norm = reg_type_raw.strip().lower()
            if reg_type_norm in valid_types:
                reg_type = reg_type_raw.strip()
        if not reg_type and not crd:
            continue
        account_id = _cell(row, "account")
        account_number = _cell(row, "account_number")
        advisor_raw = _cell(row, "advisor")
        model = _cell(row, "model")
        firm_raw = _cell(row, "firm")
        enterprise = _cell(row, "enterprise")

        # Transform to match aggregated holdings format for synthetic_id
        advisor = _format_advisor_for_hash(advisor_raw)
        firm = _format_firm_for_hash(firm_raw)
        last4 = _extract_last4(account_number) or _extract_last4(account_id)
        account_variants = _account_variants_for_hash(account_number, account_id)
        if not account_variants:
            account_variants = [account_id or account_number or ""]

        # Try all account formats (***** and ****) - aggregated uses both
        synthetic_id_candidates = [
            _synthetic_id(acc, advisor, model, firm, enterprise)
            for acc in account_variants
        ]
        result.append({
            "synthetic_id": synthetic_id_candidates[0],
            "synthetic_id_candidates": synthetic_id_candidates,
            "registration_type": reg_type,
            "advisor_crd": crd or None,
            "advisor": advisor,
            "model": model,
            "firm": firm,
            "enterprise": enterprise,
            "last4": last4,
        })

    logger.info(
        "Registration type CSV: %s rows with registration type and/or Advisor CRD",
        len(result),
    )
    return result
