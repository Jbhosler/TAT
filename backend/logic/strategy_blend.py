"""
Blend multiple strategies into a single model portfolio for prospect transitions.
Each model ticker retains its own blended target % (e.g. VOO and IVV both appear when
constituent strategies use different tickers in the same asset class).
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any, Dict, List, Optional, Sequence, Tuple
from uuid import UUID

from sqlalchemy.orm import Session

from backend.api.models.database import AssetClass, Strategy, StrategyPosition
from backend.logic.rebalancer import normalize_ticker, round_to_precision


class StrategyBlendError(ValueError):
    """Invalid blend configuration."""


def _parse_blend_components(
    components: Sequence[Dict[str, Any]],
) -> List[Tuple[UUID, Decimal]]:
    if not components:
        raise StrategyBlendError("Strategy blend must include at least one strategy")

    parsed: List[Tuple[UUID, Decimal]] = []
    seen_ids: set[UUID] = set()
    for item in components:
        sid = item.get("strategy_id")
        weight = item.get("weight")
        if sid is None:
            raise StrategyBlendError("Each blend entry requires strategy_id")
        if weight is None:
            raise StrategyBlendError("Each blend entry requires weight")
        try:
            sid_uuid = UUID(str(sid))
            weight_dec = Decimal(str(weight))
            if weight_dec <= 0:
                raise StrategyBlendError(
                    f"Blend weights must be positive. Got {weight} for strategy {sid}"
                )
            parsed.append((sid_uuid, weight_dec))
            if sid_uuid in seen_ids:
                raise StrategyBlendError(f"Duplicate strategy in blend: {sid}")
            seen_ids.add(sid_uuid)
        except StrategyBlendError:
            raise
        except Exception as exc:
            raise StrategyBlendError(f"Invalid blend entry: {item}") from exc

    total = sum(w for _, w in parsed)
    if not (Decimal("99.999") <= total <= Decimal("100.001")):
        raise StrategyBlendError(
            f"Blend weights must sum to 100%. Current total: {float(total):.3f}%"
        )

    parsed.sort(key=lambda x: (-x[1], str(x[0])))
    return parsed


def blend_display_name(strategies_by_id: Dict[UUID, Strategy], components: Sequence[Dict[str, Any]]) -> str:
    sorted_components = sorted(
        components,
        key=lambda c: (-Decimal(str(c["weight"])), str(c["strategy_id"])),
    )
    parts: List[str] = []
    for item in sorted_components:
        sid = UUID(str(item["strategy_id"]))
        weight = Decimal(str(item["weight"]))
        name = strategies_by_id[sid].name if sid in strategies_by_id else str(sid)
        w = float(weight)
        w_str = f"{w:g}" if w == int(w) else f"{w:.1f}"
        parts.append(f"{w_str}% {name}")
    return " + ".join(parts)


def build_blended_positions(
    db: Session,
    components: Sequence[Dict[str, Any]],
) -> Tuple[List[Dict[str, Any]], Dict[UUID, Strategy], str]:
    """
    Compute blended target allocations per model ticker (not collapsed per asset class).
    """
    parsed = _parse_blend_components(components)
    strategy_ids = [sid for sid, _ in parsed]

    strategies = db.query(Strategy).filter(Strategy.id.in_(strategy_ids)).all()
    strategies_by_id = {s.id: s for s in strategies}
    missing = [str(sid) for sid in strategy_ids if sid not in strategies_by_id]
    if missing:
        raise StrategyBlendError(f"Unknown strategy id(s): {', '.join(missing)}")

    positions_db = (
        db.query(StrategyPosition)
        .filter(StrategyPosition.strategy_id.in_(strategy_ids))
        .all()
    )

    # Blend per model ticker across strategies.
    ticker_target: Dict[str, Decimal] = {}
    ticker_drift_weighted: Dict[str, Decimal] = {}
    ticker_drift_weight: Dict[str, Decimal] = {}
    ticker_asset_class: Dict[str, AssetClass] = {}

    for pos in positions_db:
        mt = pos.model_ticker
        ac = pos.asset_class
        strategy_id = pos.strategy_id
        weight = next(w for sid, w in parsed if sid == strategy_id)
        weight_frac = weight / Decimal("100")
        target = Decimal(str(pos.target_allocation)) * weight_frac
        drift = Decimal(str(pos.drift_percentage))

        if mt in ticker_asset_class and ticker_asset_class[mt] != ac:
            raise StrategyBlendError(
                f"Conflicting asset classes for {mt} across blended strategies: "
                f"{ticker_asset_class[mt].value} vs {ac.value}"
            )
        ticker_target[mt] = ticker_target.get(mt, Decimal("0")) + target
        ticker_drift_weighted[mt] = ticker_drift_weighted.get(mt, Decimal("0")) + (drift * weight_frac)
        ticker_drift_weight[mt] = ticker_drift_weight.get(mt, Decimal("0")) + weight_frac
        ticker_asset_class[mt] = ac

    if not ticker_target:
        raise StrategyBlendError("Blended strategies have no positions")

    positions: List[Dict[str, Any]] = []
    for mt, target in sorted(ticker_target.items(), key=lambda x: -x[1]):
        drift_total = ticker_drift_weight.get(mt, Decimal("0"))
        drift = (
            ticker_drift_weighted[mt] / drift_total
            if drift_total > 0
            else Decimal("0")
        )
        positions.append({
            "model_ticker": mt,
            "asset_class": ticker_asset_class[mt].value,
            "target_allocation": float(round_to_precision(target)),
            "drift_percentage": float(round_to_precision(drift)),
        })

    # Normalize rounding so allocations sum to 100%.
    total = sum(Decimal(str(p["target_allocation"])) for p in positions)
    if positions and total != Decimal("100"):
        diff = Decimal("100") - total
        positions[0]["target_allocation"] = float(
            round_to_precision(Decimal(str(positions[0]["target_allocation"])) + diff)
        )

    display_name = blend_display_name(strategies_by_id, components)
    return positions, strategies_by_id, display_name


def load_blended_product_equivalents(
    db: Session,
    components: Sequence[Dict[str, Any]],
    load_effective_fn,
) -> Tuple[Dict[str, Dict[str, int]], str]:
    """
    Merge product equivalents from all blend strategies.
    Higher-weight strategies win when the same legacy ticker maps to different model tickers.
    Legacy-ticker keys are normalized (uppercase) for case-insensitive matching.
    """
    parsed = _parse_blend_components(components)
    strategy_ids = [sid for sid, _ in parsed]
    strategies = db.query(Strategy).filter(Strategy.id.in_(strategy_ids)).all()
    strategies_by_id = {s.id: s for s in strategies}
    missing = [str(sid) for sid in strategy_ids if sid not in strategies_by_id]
    if missing:
        raise StrategyBlendError(f"Unknown strategy id(s): {', '.join(missing)}")

    product_equivalents: Dict[str, Dict[str, int]] = {}
    source_names: List[str] = []

    for sid, _weight in parsed:
        equivalents, source_name = load_effective_fn(db, strategies_by_id[sid])
        if source_name not in source_names:
            source_names.append(source_name)
        for pe in equivalents:
            legacy = normalize_ticker(pe.legacy_ticker)
            if legacy not in product_equivalents:
                product_equivalents[legacy] = {}
            grade = pe.grade if pe.grade is not None else 2
            if pe.model_ticker not in product_equivalents[legacy]:
                product_equivalents[legacy][pe.model_ticker] = grade

    pe_source = " + ".join(source_names) if source_names else "blend"
    return product_equivalents, pe_source


def primary_strategy_id(components: Sequence[Dict[str, Any]]) -> UUID:
    """Highest-weight strategy id (FK anchor for prospects)."""
    parsed = _parse_blend_components(components)
    return parsed[0][0]


def blend_version_snapshot(
    db: Session,
    components: Sequence[Dict[str, Any]],
) -> Dict[str, int]:
    parsed = _parse_blend_components(components)
    snapshot: Dict[str, int] = {}
    for sid, _ in parsed:
        strategy = db.query(Strategy).filter(Strategy.id == sid).first()
        if strategy:
            snapshot[str(sid)] = strategy.version
    return snapshot


def is_blend_stale(
    db: Session,
    components: Sequence[Dict[str, Any]],
    stored_versions: Optional[Dict[str, int]],
    result_strategy_version: Optional[int] = None,
) -> bool:
    current = blend_version_snapshot(db, components)
    if stored_versions:
        for sid, version in current.items():
            stored = stored_versions.get(sid)
            if stored is not None and version > stored:
                return True
        return False
    # Fallback when snapshot column missing (pre-migration results).
    if result_strategy_version is not None:
        return any(version > result_strategy_version for version in current.values())
    return False


def components_with_versions(
    components: Sequence[Dict[str, Any]],
    version_snapshot: Dict[str, int],
) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for item in components:
        sid = str(item["strategy_id"])
        entry = {
            "strategy_id": sid,
            "weight": float(item["weight"]),
        }
        if sid in version_snapshot:
            entry["version"] = version_snapshot[sid]
        out.append(entry)
    return out
