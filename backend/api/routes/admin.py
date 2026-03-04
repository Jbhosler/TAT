"""
Admin panel endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from typing import List, Dict, Any
from uuid import UUID
from collections import defaultdict
from backend.database.connection import get_db
from backend.api.models.database import (
    AssetClass, ProductEquivalent, Strategy, StrategyPosition
)
from backend.api.models.schemas import (
    ProductEquivalentCreate,
    ProductEquivalentResponse,
    ProductEquivalentUpdate,
    SanityCheckResponse,
    MultiMappingConflict,
    GradeInconsistencyConflict,
    OrphanedModelTicker,
    StrategyRef,
    ReplaceModelTickerRequest,
    ResolveConflictRequest,
    SanityCheckPreflightRequest,
)
from backend.utils.csv_parser import parse_product_equivalents_csv

router = APIRouter()


def _run_sanity_checks(
    db: Session,
    equivalents_override: Dict[UUID, List[Dict[str, Any]]] | None = None,
) -> SanityCheckResponse:
    """
    Run sanity checks on product_equivalents (and strategy_positions for orphans).
    If equivalents_override is provided, for each strategy_id it replaces that strategy's
    product equivalents with the given list (for preflight simulation).
    """
    if equivalents_override is None:
        equivalents_override = {}

    strategies_by_id = {s.id: s for s in db.query(Strategy).all()}

    # Build PE rows: use override where provided, else from DB.
    # For preflight (one strategy in override): only load DB rows for legacy_tickers in the upload,
    # so we don't scan all strategies. Otherwise load all PE in one query.
    pe_rows: List[Dict[str, Any]] = []
    override_strategy_ids = set(equivalents_override.keys())

    if len(override_strategy_ids) == 1:
        # Preflight: only load PE for legacy_tickers in the upload (multi-mapping/grade).
        # Orphan check needs full PE for other strategies; we load that separately.
        legacy_tickers = {r["legacy_ticker"] for rows in equivalents_override.values() for r in rows}
        for strat_id, rows in equivalents_override.items():
            for row in rows:
                pe_rows.append({
                    "strategy_id": strat_id,
                    "legacy_ticker": row["legacy_ticker"],
                    "model_ticker": row["model_ticker"],
                    "grade": row["grade"],
                })
        if legacy_tickers:
            other_pe_scoped = db.query(ProductEquivalent).filter(
                ProductEquivalent.strategy_id.notin_(override_strategy_ids),
                ProductEquivalent.legacy_ticker.in_(legacy_tickers),
            ).all()
            for pe in other_pe_scoped:
                pe_rows.append({
                    "strategy_id": pe.strategy_id,
                    "legacy_ticker": pe.legacy_ticker,
                    "model_ticker": pe.model_ticker,
                    "grade": pe.grade,
                })
    else:
        # Full sanity check or multi-strategy override: load all PE in one query
        all_pe = db.query(ProductEquivalent).all()
        for pe in all_pe:
            if pe.strategy_id in equivalents_override:
                continue  # use override instead
            pe_rows.append({
                "strategy_id": pe.strategy_id,
                "legacy_ticker": pe.legacy_ticker,
                "model_ticker": pe.model_ticker,
                "grade": pe.grade,
            })
        for strat_id, rows in equivalents_override.items():
            for row in rows:
                pe_rows.append({
                    "strategy_id": strat_id,
                    "legacy_ticker": row["legacy_ticker"],
                    "model_ticker": row["model_ticker"],
                    "grade": row["grade"],
                })

    # Build pe_by_strat_model for orphaned check.
    # Preflight: pe_rows has limited data; load full PE for other strategies for orphan check.
    pe_by_strat_model = defaultdict(set)
    for r in pe_rows:
        pe_by_strat_model[(r["strategy_id"], r["model_ticker"])].add(r["grade"])
    if len(override_strategy_ids) == 1:
        other_pe = db.query(ProductEquivalent).filter(
            ProductEquivalent.strategy_id.notin_(override_strategy_ids),
        ).all()
        for pe in other_pe:
            pe_by_strat_model[(pe.strategy_id, pe.model_ticker)].add(pe.grade)

    # Multi-mapping: legacy_ticker mapped to different model tickers across strategies (conflict)
    # Same legacy -> same model ticker in multiple strategies is OK; different model tickers is a conflict
    by_legacy: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for r in pe_rows:
        by_legacy[r["legacy_ticker"]].append(r)

    multi_mapping: List[MultiMappingConflict] = []
    seen_legacy_multi = set()
    for legacy, rows in by_legacy.items():
        unique_model_tickers = {r["model_ticker"] for r in rows}
        if len(unique_model_tickers) <= 1:
            continue
        if legacy in seen_legacy_multi:
            continue
        seen_legacy_multi.add(legacy)
        model_tickers = list({r["model_ticker"] for r in rows})
        strategies = [StrategyRef(id=r["strategy_id"], name=strategies_by_id[r["strategy_id"]].name) for r in rows]
        mappings = [
            {
                "strategy_id": str(r["strategy_id"]),
                "strategy_name": strategies_by_id[r["strategy_id"]].name,
                "model_ticker": r["model_ticker"],
                "grade": r["grade"],
            }
            for r in rows
        ]
        multi_mapping.append(MultiMappingConflict(
            legacy_ticker=legacy,
            model_tickers=model_tickers,
            strategies=strategies,
            mappings=mappings,
        ))

    # Grade inconsistency: same legacy_ticker, different grades across strategies
    grade_inconsistencies: List[GradeInconsistencyConflict] = []
    seen_legacy_grade = set()
    for legacy, rows in by_legacy.items():
        grades = {r["grade"] for r in rows}
        if len(grades) <= 1:
            continue
        if legacy in seen_legacy_grade:
            continue
        seen_legacy_grade.add(legacy)
        strategies = [StrategyRef(id=r["strategy_id"], name=strategies_by_id[r["strategy_id"]].name) for r in rows]
        grades_by_strategy = [
            {
                "strategy_id": str(r["strategy_id"]),
                "strategy_name": strategies_by_id[r["strategy_id"]].name,
                "model_ticker": r["model_ticker"],
                "grade": r["grade"],
            }
            for r in rows
        ]
        grade_inconsistencies.append(GradeInconsistencyConflict(
            legacy_ticker=legacy,
            strategies=strategies,
            grades_by_strategy=grades_by_strategy,
        ))

    # Orphaned model tickers: (strategy_id, model_ticker) in strategy_positions with no grade-0 in PE
    # Use DB for positions (override doesn't change strategy positions)
    position_rows = db.query(StrategyPosition).all()

    orphaned: List[OrphanedModelTicker] = []
    for pos in position_rows:
        has_grade0 = 0 in pe_by_strat_model.get((pos.strategy_id, pos.model_ticker), set())
        if not has_grade0:
            orphaned.append(OrphanedModelTicker(
                strategy_id=pos.strategy_id,
                strategy_name=strategies_by_id[pos.strategy_id].name,
                model_ticker=pos.model_ticker,
            ))

    return SanityCheckResponse(
        multi_mapping_conflicts=multi_mapping,
        grade_inconsistencies=grade_inconsistencies,
        orphaned_model_tickers=orphaned,
    )


@router.get("/asset-classes")
async def list_asset_classes():
    """List all 9 asset classes."""
    return [ac.value for ac in AssetClass if ac != AssetClass.CASH]


@router.get("/product-equivalents/{strategy_id}", response_model=List[ProductEquivalentResponse])
async def get_product_equivalents(
    strategy_id: UUID,
    db: Session = Depends(get_db)
):
    """Get product equivalents (GE_Alt.csv data) for a strategy."""
    equivalents = db.query(ProductEquivalent).filter(
        ProductEquivalent.strategy_id == strategy_id
    ).all()
    return [ProductEquivalentResponse.model_validate(e) for e in equivalents]


@router.post("/product-equivalents/{strategy_id}")
async def upload_product_equivalents(
    request: Request,
    strategy_id: UUID,
    db: Session = Depends(get_db)
):
    """Upload GE_Alt.csv (Product Equivalents) for a strategy. Accepts raw CSV body (text/csv or text/plain)."""
    # Verify strategy exists
    strategy = db.query(Strategy).filter(Strategy.id == strategy_id).first()
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")

    # Read raw body so we accept text/csv (FastAPI would otherwise expect JSON and return 422)
    body = await request.body()
    csv_content = body.decode("utf-8-sig").strip()  # utf-8-sig strips BOM if present

    try:
        equivalents_data = parse_product_equivalents_csv(csv_content)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        # Build lookup of existing grades by (legacy_ticker, model_ticker) before delete
        existing = db.query(ProductEquivalent).filter(
            ProductEquivalent.strategy_id == strategy_id
        ).all()
        grade_lookup = {(pe.legacy_ticker, pe.model_ticker): pe.grade for pe in existing}

        # Delete existing equivalents
        db.query(ProductEquivalent).filter(
            ProductEquivalent.strategy_id == strategy_id
        ).delete()

        # Add new equivalents, preserving grades when CSV has no grade and we had one
        for equiv_data in equivalents_data:
            csv_grade = equiv_data.get('grade')
            key = (equiv_data['legacy_ticker'], equiv_data['model_ticker'])
            grade = csv_grade if csv_grade is not None else grade_lookup.get(key)

            db_equiv = ProductEquivalent(
                strategy_id=strategy_id,
                legacy_ticker=equiv_data['legacy_ticker'],
                model_ticker=equiv_data['model_ticker'],
                grade=grade,
                buy_control=equiv_data.get('buy_control'),
                sell_control=equiv_data.get('sell_control'),
                custodian=equiv_data.get('custodian'),
                notes=equiv_data.get('notes'),
                description=equiv_data.get('description'),
            )
            db.add(db_equiv)

        db.commit()
        return {"message": "Product equivalents uploaded successfully", "count": len(equivalents_data)}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


@router.delete("/product-equivalents/{strategy_id}/{equivalent_id}")
async def delete_product_equivalent(
    strategy_id: UUID,
    equivalent_id: UUID,
    db: Session = Depends(get_db)
):
    """Delete a single product equivalent by ID."""
    pe = (
        db.query(ProductEquivalent)
        .filter(
            ProductEquivalent.id == equivalent_id,
            ProductEquivalent.strategy_id == strategy_id,
        )
        .first()
    )
    if not pe:
        raise HTTPException(status_code=404, detail="Product equivalent not found")
    db.delete(pe)
    db.commit()
    return {"message": "Product equivalent deleted"}


@router.patch("/product-equivalents/{strategy_id}/{equivalent_id}", response_model=ProductEquivalentResponse)
async def update_product_equivalent(
    strategy_id: UUID,
    equivalent_id: UUID,
    body: ProductEquivalentUpdate,
    db: Session = Depends(get_db),
):
    """Update a product equivalent (e.g. grade). Grade is stored in the app, not from CSV."""
    pe = (
        db.query(ProductEquivalent)
        .filter(
            ProductEquivalent.id == equivalent_id,
            ProductEquivalent.strategy_id == strategy_id,
        )
        .first()
    )
    if not pe:
        raise HTTPException(status_code=404, detail="Product equivalent not found")
    if body.grade is not None:
        pe.grade = body.grade
    try:
        db.commit()
        db.refresh(pe)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to save grade: {str(e)}")
    return ProductEquivalentResponse.model_validate(pe)


@router.get("/sanity-check", response_model=SanityCheckResponse)
async def get_sanity_check(db: Session = Depends(get_db)):
    """
    Scan Product_Equivalents and Strategy_Models to detect:
    - Multi-mapping: legacy ticker mapped to more than one model ticker across strategies
    - Grade inconsistency: same legacy ticker with different grades across strategies
    - Orphaned model tickers: model ticker in strategy_positions with no Grade 0 in product_equivalents
    """
    return _run_sanity_checks(db)


@router.post("/sanity-check/preflight", response_model=SanityCheckResponse)
async def sanity_check_preflight(
    body: SanityCheckPreflightRequest,
    db: Session = Depends(get_db),
):
    """
    Run sanity check as if the given product equivalents CSV were applied to the strategy.
    Used before committing a bulk product equivalents upload to warn of potential new conflicts.
    """
    strategy = db.query(Strategy).filter(Strategy.id == body.strategy_id).first()
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")
    try:
        rows = parse_product_equivalents_csv(body.csv_content)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    equivalents_override = {
        body.strategy_id: [
            {"legacy_ticker": r["legacy_ticker"], "model_ticker": r["model_ticker"], "grade": r["grade"]}
            for r in rows
        ]
    }
    return _run_sanity_checks(db, equivalents_override=equivalents_override)


@router.post("/replace-model-ticker")
async def replace_model_ticker(
    body: ReplaceModelTickerRequest,
    db: Session = Depends(get_db),
):
    """
    Replace a model ticker with another (e.g. SPYM -> VOO) across product_equivalents and strategy_positions.
    Optionally add the old ticker as Grade 1 equivalent for the new model ticker.
    Transaction-safe; all updates in a single transaction.
    """
    if not body.apply_to_all_strategies and not body.strategy_id:
        raise HTTPException(
            status_code=400,
            detail="Either apply_to_all_strategies=true or strategy_id must be provided"
        )
    try:
        if body.apply_to_all_strategies:
            strategies_to_update = [s.id for s in db.query(Strategy).all()]
        else:
            strategies_to_update = [body.strategy_id]
            strategy = db.query(Strategy).filter(Strategy.id == body.strategy_id).first()
            if not strategy:
                raise HTTPException(status_code=404, detail="Strategy not found")

        for sid in strategies_to_update:
            # Update product_equivalents: model_ticker old -> new
            pe_list = db.query(ProductEquivalent).filter(
                ProductEquivalent.strategy_id == sid,
                ProductEquivalent.model_ticker == body.old_model_ticker,
            ).all()
            for pe in pe_list:
                pe.model_ticker = body.new_model_ticker

            # If add_old_as_grade1: insert (legacy_ticker=old, model_ticker=new, grade=1) if not exists
            if body.add_old_as_grade1:
                exists = db.query(ProductEquivalent).filter(
                    ProductEquivalent.strategy_id == sid,
                    ProductEquivalent.legacy_ticker == body.old_model_ticker,
                    ProductEquivalent.model_ticker == body.new_model_ticker,
                ).first()
                if not exists:
                    db.add(ProductEquivalent(
                        strategy_id=sid,
                        legacy_ticker=body.old_model_ticker,
                        model_ticker=body.new_model_ticker,
                        grade=1,
                    ))

            # Update strategy_positions: model_ticker old -> new
            db.query(StrategyPosition).filter(
                StrategyPosition.strategy_id == sid,
                StrategyPosition.model_ticker == body.old_model_ticker,
            ).update({StrategyPosition.model_ticker: body.new_model_ticker}, synchronize_session=False)

        db.commit()
        return {
            "message": "Model ticker replaced successfully",
            "strategies_updated": len(strategies_to_update),
            "add_old_as_grade1": body.add_old_as_grade1,
        }
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/resolve-conflict")
async def resolve_conflict(
    body: ResolveConflictRequest,
    db: Session = Depends(get_db),
):
    """
    Apply a master mapping for a legacy (alternate) ticker across selected strategies.
    Updates all product_equivalents rows for that legacy_ticker to the given model_ticker and grade.
    Transaction-safe.
    """
    try:
        q = db.query(ProductEquivalent).filter(ProductEquivalent.legacy_ticker == body.legacy_ticker)
        if body.strategy_ids is not None:
            q = q.filter(ProductEquivalent.strategy_id.in_(body.strategy_ids))
        rows = q.all()
        for pe in rows:
            pe.model_ticker = body.master_model_ticker
            pe.grade = body.master_grade
        db.commit()
        return {
            "message": "Conflict resolved; master mapping applied",
            "rows_updated": len(rows),
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
