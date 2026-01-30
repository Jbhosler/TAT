"""
CSV parsing utilities for Strategy, Prospect, and Product Equivalents uploads.
"""
import csv
import io
from typing import List, Dict, Any
from decimal import Decimal
from backend.api.models.schemas import (
    BulkStrategyUpload,
    ProspectCSVRow,
    ProductEquivalentCSVRow
)
from backend.api.models.database import AssetClass


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


def parse_product_equivalents_csv(csv_content: str) -> List[Dict[str, Any]]:
    """
    Parse GE_Alt.csv (Product Equivalents).
    Format: Legacy Ticker, Model Ticker, Grade (headers flexible: case-insensitive, BOM stripped)
    
    Args:
        csv_content: CSV file content as string
        
    Returns:
        List of product equivalent dictionaries
    """
    csv_content = (csv_content or "").strip().strip("\ufeff")
    if not csv_content:
        return []

    reader = csv.DictReader(io.StringIO(csv_content))
    equivalents = []

    for row in reader:
        if not any(v and str(v).strip() for v in row.values()):
            continue
        legacy_ticker = _get_column(row, ["Legacy Ticker", "legacy_ticker"])
        model_ticker = _get_column(row, ["Model Ticker", "model_ticker"])
        grade_str = _get_column(row, ["Grade", "grade"])
        if not grade_str:
            raise ValueError("Grade is required for each row.")
        try:
            grade = int(grade_str)
        except ValueError:
            raise ValueError(f"Grade must be a number (0, 1, or 2). Got: {grade_str!r}")
        if grade not in [0, 1, 2]:
            raise ValueError(f"Invalid grade: {grade}. Must be 0, 1, or 2.")
        equivalents.append({
            "legacy_ticker": legacy_ticker,
            "model_ticker": model_ticker,
            "grade": grade,
        })

    return equivalents
