"""
Monitoring drift and deviation engine.
Computes asset class roll-up, deviation score, and purity score from holdings and strategy data.
No DB dependency; accepts pre-loaded strategy positions and product equivalents.
"""
import logging
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict, List, Tuple

logger = logging.getLogger(__name__)

PRECISION = Decimal("0.001")


def round_to_precision(value: Decimal) -> Decimal:
    if not isinstance(value, Decimal):
        value = Decimal(str(value))
    return value.quantize(PRECISION, rounding=ROUND_HALF_UP)


def _build_pe_map(
    product_equivalents: List[Dict[str, Any]],
) -> Dict[str, Tuple[str, int]]:
    """Build legacy_ticker -> (model_ticker, grade). First match wins if duplicates."""
    out = {}
    for pe in product_equivalents:
        legacy = (pe.get("legacy_ticker") or "").strip()
        if not legacy:
            continue
        model = (pe.get("model_ticker") or "").strip()
        grade = int(pe.get("grade", 2))
        if legacy not in out:
            out[legacy] = (model, grade)
    return out


def _build_positions_map(
    positions: List[Dict[str, Any]],
) -> Tuple[Dict[str, str], Dict[str, Decimal]]:
    """Build model_ticker -> asset_class (str), and asset_class -> target_allocation."""
    model_to_ac = {}
    target_by_ac = {}
    for pos in positions:
        model = (pos.get("model_ticker") or "").strip()
        ac = pos.get("asset_class")
        if isinstance(ac, str):
            ac_str = ac
        else:
            ac_str = getattr(ac, "value", str(ac))
        target = Decimal(str(pos.get("target_allocation", 0)))
        if model:
            model_to_ac[model] = ac_str
        if ac_str not in target_by_ac:
            target_by_ac[ac_str] = Decimal("0")
        target_by_ac[ac_str] = round_to_precision(target_by_ac[ac_str] + target)
    return model_to_ac, target_by_ac


def compute_rollup_and_scores(
    holdings: List[Dict[str, Any]],
    cash_value: Decimal,
    positions: List[Dict[str, Any]],
    product_equivalents: List[Dict[str, Any]],
) -> Tuple[Dict[str, Decimal], Decimal, Decimal, List[Dict[str, Any]]]:
    """
    Asset class roll-up, deviation score, purity score, and enriched holdings.

    Args:
        holdings: List of {ticker, value} (market value; exclude cash).
        cash_value: Single cash position value (counted once in CASH asset class).
        positions: Strategy positions [{model_ticker, asset_class, target_allocation}].
        product_equivalents: [{legacy_ticker, model_ticker, grade}].

    Returns:
        (actual_pct_by_asset_class, total_deviation_score, purity_score, holdings_with_metadata)
        where holdings_with_metadata = [{ticker, value, asset_class, grade, weight_pct}]
    """
    total_value = sum(Decimal(str(h.get("value", 0))) for h in holdings) + Decimal(str(cash_value))
    if total_value <= 0:
        return {}, Decimal("0"), Decimal("0"), []

    pe_map = _build_pe_map(product_equivalents)
    model_to_ac, target_by_ac = _build_positions_map(positions)

    value_by_ac: Dict[str, Decimal] = {}
    grade0_value = Decimal("0")
    holdings_with_metadata: List[Dict[str, Any]] = []

    for h in holdings:
        ticker = (h.get("ticker") or "").strip()
        value = Decimal(str(h.get("value", 0)))
        if value <= 0:
            continue
        model_ticker, grade = pe_map.get(ticker, (None, 2))
        asset_class = None
        if model_ticker and model_ticker in model_to_ac:
            asset_class = model_to_ac[model_ticker]
        elif ticker in model_to_ac:
            # Holding is itself a model ticker (no product equivalent row needed)
            asset_class = model_to_ac[ticker]
            grade = 0
        if asset_class is None:
            asset_class = "Other"
        if asset_class not in value_by_ac:
            value_by_ac[asset_class] = Decimal("0")
        value_by_ac[asset_class] += value
        if grade == 0:
            grade0_value += value
        weight_pct = round_to_precision((value / total_value) * Decimal("100")) if total_value else Decimal("0")
        holdings_with_metadata.append({
            "ticker": ticker,
            "value": value,
            "asset_class": asset_class,
            "grade": grade,
            "weight_pct": float(weight_pct),
        })

    if cash_value > 0:
        cash_ac = "Cash"
        if cash_ac not in value_by_ac:
            value_by_ac[cash_ac] = Decimal("0")
        value_by_ac[cash_ac] += cash_value
        weight_pct_cash = round_to_precision((cash_value / total_value) * Decimal("100"))
        holdings_with_metadata.append({
            "ticker": "CASH",
            "value": cash_value,
            "asset_class": cash_ac,
            "grade": 0,
            "weight_pct": float(weight_pct_cash),
        })

    actual_pct_by_ac: Dict[str, Decimal] = {}
    for ac, val in value_by_ac.items():
        actual_pct_by_ac[ac] = round_to_precision((val / total_value) * Decimal("100"))

    # Sum |actual_pct - target_pct| over all asset classes (actual and target) so missing targets count.
    all_asset_classes = set(actual_pct_by_ac.keys()) | set(target_by_ac.keys())
    deviation_score = Decimal("0")
    for ac in all_asset_classes:
        actual_pct = actual_pct_by_ac.get(ac, Decimal("0"))
        target_pct = target_by_ac.get(ac, Decimal("0"))
        drift = actual_pct - target_pct
        deviation_score += abs(drift)
    deviation_score = round_to_precision(deviation_score)

    purity_score = (grade0_value / total_value * Decimal("100")) if total_value else Decimal("0")
    purity_score = round_to_precision(purity_score)

    return actual_pct_by_ac, deviation_score, purity_score, holdings_with_metadata


def get_allocations_breakdown(
    actual_pct_by_ac: Dict[str, Decimal],
    target_by_ac: Dict[str, Decimal],
) -> List[Dict[str, Any]]:
    """Build list of {asset_class, actual_pct, target_pct, drift_pct} for drill-down."""
    all_ac = set(actual_pct_by_ac.keys()) | set(target_by_ac.keys())
    out = []
    for ac in sorted(all_ac):
        actual = actual_pct_by_ac.get(ac, Decimal("0"))
        target = target_by_ac.get(ac, Decimal("0"))
        drift = round_to_precision(actual - target)
        out.append({
            "asset_class": ac,
            "actual_pct": actual,
            "target_pct": target,
            "drift_pct": drift,
        })
    return out


def aggregate_all_vendor_models(processed_accounts: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Aggregates assets by Advisor and Model Name from the raw parsed CSV data.
    Input matches the return type of parse_aggregated_holdings_csv.
    Uses Decimal for all value aggregations (0.1% precision standard).
    """
    summary: Dict[Tuple[str, str], Dict[str, Any]] = {}
    for account in processed_accounts:
        if account.get("data_inconsistency"):
            continue
        advisor = (account.get("advisor") or "").strip()
        external_model_name = (account.get("external_model_name") or "").strip()
        key = (advisor, external_model_name)
        if key not in summary:
            summary[key] = {
                "advisor": advisor,
                "external_model_name": external_model_name,
                "total_assets": Decimal("0"),
                "account_count": 0,
                "firm": (account.get("firm") or "").strip(),
            }
        total_value = account.get("total_value")
        if total_value is not None:
            summary[key]["total_assets"] += Decimal(str(total_value))
        summary[key]["account_count"] += 1
    out = []
    for v in summary.values():
        v["total_assets"] = round_to_precision(v["total_assets"])
        out.append(v)
    return out


def get_unmapped_model_summary(holdings_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Returns a list of dictionaries grouped by advisor and external_model_name,
    summing total_value and counting accounts. Uses Decimal for all value aggregations.
    Input is the output of parse_aggregated_holdings_csv (skips data_inconsistency rows).
    """
    return aggregate_all_vendor_models(holdings_data)
