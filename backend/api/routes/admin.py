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
    AssetClass,
    AuthorizedUser,
    MonitoredAccount,
    ProductEquivalent,
    Strategy,
    StrategyPosition,
)
from backend.api.models.schemas import (
    AuthorizedUserCreateRequest,
    AuthorizedUserResponse,
    AuthorizedUserUpdateRequest,
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
from backend.utils.csv_parser import parse_product_equivalents_csv, parse_registration_type_csv
from backend.api.deps import CurrentUser, require_admin, require_super_admin

router = APIRouter(dependencies=[Depends(require_admin)])


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
    """List all asset classes including Cash."""
    return [ac.value for ac in AssetClass]


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

        # Add new equivalents, preserving grades when CSV has no grade and we had one.
        # Duplicate (legacy, model) pairs in the CSV are skipped (first row wins),
        # so downstream grade resolution is unambiguous.
        seen_pairs: set = set()
        for equiv_data in equivalents_data:
            csv_grade = equiv_data.get('grade')
            key = (equiv_data['legacy_ticker'], equiv_data['model_ticker'])
            if key in seen_pairs:
                continue
            seen_pairs.add(key)
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
        return {"message": "Product equivalents uploaded successfully", "count": len(seen_pairs)}
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


@router.get(
    "/authorized-users",
    response_model=List[AuthorizedUserResponse],
    dependencies=[Depends(require_super_admin)],
)
async def list_authorized_users(db: Session = Depends(get_db)):
    """List authorized users."""
    users = db.query(AuthorizedUser).order_by(AuthorizedUser.created_at.desc()).all()
    return [AuthorizedUserResponse.model_validate(user) for user in users]


@router.post(
    "/authorized-users",
    response_model=AuthorizedUserResponse,
    dependencies=[Depends(require_super_admin)],
)
async def create_authorized_user(
    request: AuthorizedUserCreateRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_super_admin),
):
    """Create an authorized user."""
    existing = db.query(AuthorizedUser).filter(AuthorizedUser.email == request.email).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already exists")

    user = AuthorizedUser(
        email=request.email,
        display_name=request.display_name,
        role=request.role,
        is_active=True,
        added_by=current_user["email"],
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return AuthorizedUserResponse.model_validate(user)


@router.patch(
    "/authorized-users/{email}",
    response_model=AuthorizedUserResponse,
    dependencies=[Depends(require_super_admin)],
)
async def update_authorized_user(
    email: str,
    request: AuthorizedUserUpdateRequest,
    db: Session = Depends(get_db),
):
    """Update role/display_name/active status for an authorized user."""
    email_normalized = email.strip().lower()
    user = db.query(AuthorizedUser).filter(AuthorizedUser.email == email_normalized).first()
    if not user:
        raise HTTPException(status_code=404, detail="Authorized user not found")

    if request.display_name is not None:
        user.display_name = request.display_name
    if request.role is not None:
        user.role = request.role
    if request.is_active is not None:
        user.is_active = request.is_active

    db.commit()
    db.refresh(user)
    return AuthorizedUserResponse.model_validate(user)


@router.delete(
    "/authorized-users/{email}",
    response_model=AuthorizedUserResponse,
    dependencies=[Depends(require_super_admin)],
)
async def deactivate_authorized_user(email: str, db: Session = Depends(get_db)):
    """Soft-delete (deactivate) an authorized user."""
    email_normalized = email.strip().lower()
    user = db.query(AuthorizedUser).filter(AuthorizedUser.email == email_normalized).first()
    if not user:
        raise HTTPException(status_code=404, detail="Authorized user not found")

    user.is_active = False
    db.commit()
    db.refresh(user)
    return AuthorizedUserResponse.model_validate(user)


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


@router.get("/registration-type-sample")
async def get_registration_type_sample(
    limit: int = 50,
    db: Session = Depends(get_db),
):
    """
    Return sample accounts from DB showing the exact format used for matching.
    Use this to compare with your registration type file - your columns must produce
    the same values. synthetic_id = hash(Account|Adviser|Model|Firm|Enterprise).
    """
    accounts = (
        db.query(MonitoredAccount)
        .filter(
            MonitoredAccount.advisor.isnot(None),
            MonitoredAccount.external_model_name.isnot(None),
        )
        .limit(limit)
        .all()
    )
    # Distinct advisors and models for comparison
    advisors = sorted(set((a.advisor or "").strip() for a in accounts if (a.advisor or "").strip()))
    models = sorted(set((a.external_model_name or "").strip() for a in accounts if (a.external_model_name or "").strip()))
    return {
        "sample_accounts": [
            {
                "advisor": a.advisor,
                "account_display": a.account_display,
                "external_model_name": a.external_model_name,
                "firm": a.firm,
                "synthetic_id_prefix": (a.synthetic_id or "")[:12] + "…" if a.synthetic_id else None,
            }
            for a in accounts
        ],
        "distinct_advisors": advisors[:30],
        "distinct_models": models[:30],
        "note": "Your file's Adviser, Account, Product/Model, Firm, Enterprise must match these values exactly (including spelling) to produce the same synthetic_id.",
    }


def _account_matches_fallback(acc: MonitoredAccount, advisor: str, model: str, last4: str) -> bool:
    """Match account by advisor + last4 + external_model_name when synthetic_id fails."""
    if not advisor or not model or not last4:
        return False
    advisor_match = (acc.advisor or "").strip().lower() == advisor.strip().lower()
    model_match = (acc.external_model_name or "").strip().lower() == model.strip().lower()
    if not advisor_match or not model_match:
        return False
    display = (acc.account_display or "").strip()
    return last4 in display or display.endswith(last4)


@router.post("/registration-type-upload")
async def upload_registration_type(
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Upload CSV with Registration Type (Retirement, Taxable, Trust) per account and Advisor CRD.
    Matches by synthetic_id first; falls back to advisor + last4 of account + Product/Model.
    Expected columns: Adviser, Account, Product (or Program/Model), Firm, Enterprise,
    Registration Type, Advisor CRD.
    Account Number (e.g. xxx-5290) used for fallback matching when Account format differs.
    CRD is adviser-level: after matching, the same CRD is copied to every account with that adviser name.
    """
    body = await request.body()
    csv_content = body.decode("utf-8-sig").strip()

    try:
        rows = parse_registration_type_csv(csv_content)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not rows:
        return {"message": "No valid rows with Registration Type or Advisor CRD found", "updated_count": 0}

    # Collect all synthetic_id candidates (parser may return ***** and **** variants)
    all_sids = set()
    for r in rows:
        for sid in r.get("synthetic_id_candidates", [r["synthetic_id"]]):
            all_sids.add(sid)
    accounts = db.query(MonitoredAccount).filter(MonitoredAccount.synthetic_id.in_(all_sids)).all()
    account_by_sid = {a.synthetic_id: a for a in accounts}

    updated = 0
    fallback_matched = 0
    unmatched = []
    for r in rows:
        acc = None
        for sid in r.get("synthetic_id_candidates", [r["synthetic_id"]]):
            acc = account_by_sid.get(sid)
            if acc:
                break
        if acc:
            if r.get("registration_type"):
                acc.registration_type = r["registration_type"]
                updated += 1
            if r.get("advisor_crd"):
                acc.advisor_crd = r["advisor_crd"]
        elif r.get("registration_type"):
            unmatched.append(r)

    # Fallback: match by advisor + last4 + model when synthetic_id fails
    if unmatched:
        all_accounts = db.query(MonitoredAccount).all()
        for r in unmatched:
            if not (r.get("last4") and r.get("advisor") and r.get("model")):
                continue
            for a in all_accounts:
                if _account_matches_fallback(a, r["advisor"], r["model"], r["last4"]):
                    a.registration_type = r["registration_type"]
                    if r.get("advisor_crd"):
                        a.advisor_crd = r["advisor_crd"]
                    updated += 1
                    fallback_matched += 1
                    break

    # Fan-out CRD to every account with the same adviser name (CRD is adviser-level).
    crd_by_adviser: Dict[str, str] = {}
    for r in rows:
        crd = (r.get("advisor_crd") or "").strip()
        advisor = (r.get("advisor") or "").strip()
        if crd and advisor:
            crd_by_adviser[advisor.lower()] = crd
    crd_updated = 0
    if crd_by_adviser:
        for a in db.query(MonitoredAccount).filter(MonitoredAccount.advisor.isnot(None)).all():
            key = (a.advisor or "").strip().lower()
            if key in crd_by_adviser:
                a.advisor_crd = crd_by_adviser[key]
                crd_updated += 1

    try:
        db.commit()
        resp = {
            "message": f"Updated {updated} account(s) with registration type",
            "updated_count": updated,
            "file_row_count": len(rows),
        }
        if crd_updated > 0:
            resp["crd_updated_count"] = crd_updated
            if updated == 0:
                resp["message"] = f"Updated Advisor CRD on {crd_updated} account(s)"
        if fallback_matched > 0:
            resp["fallback_matched"] = fallback_matched
        if updated == 0 and crd_updated == 0 and rows:
            # Diagnostics: compare file values to DB to find naming differences
            sample = rows[0]
            file_advisor = (sample.get("advisor") or "").strip().lower()
            file_model = (sample.get("model") or "").strip().lower()
            file_last4 = sample.get("last4") or ""

            all_acc = db.query(MonitoredAccount).filter(
                MonitoredAccount.advisor.isnot(None),
                MonitoredAccount.external_model_name.isnot(None),
            ).all()

            # Find advisors in DB - show sample for comparison
            db_advisors = list(set((a.advisor or "").strip() for a in all_acc if (a.advisor or "").strip()))
            similar_advisors = []
            if file_advisor:
                similar_advisors = [
                    a for a in db_advisors
                    if file_advisor in a.lower()
                    or (a.lower().split() and file_advisor.split() and a.lower().split()[-1] == file_advisor.split()[-1])
                ][:10]
            if not similar_advisors and db_advisors:
                similar_advisors = db_advisors[:10]

            # Find models in DB - show sample for comparison
            db_models = list(set((a.external_model_name or "").strip() for a in all_acc if (a.external_model_name or "").strip()))
            similar_models = []
            if file_model:
                similar_models = [
                    m for m in db_models
                    if any((p in (m or "").lower()) for p in file_model.split()[:2])
                ][:10]
            if not similar_models and db_models:
                similar_models = db_models[:10]

            # Accounts with matching last4 in account_display
            with_last4 = [a for a in all_acc if file_last4 and file_last4 in (a.account_display or "")]
            resp["diagnostics"] = {
                "sample_file_values": {
                    "advisor": sample.get("advisor"),
                    "model": sample.get("model"),
                    "last4": sample.get("last4"),
                },
                "db_advisors_sample": similar_advisors,
                "db_models_sample": similar_models,
                "db_accounts_with_last4": [
                    {"advisor": a.advisor, "account_display": a.account_display, "external_model_name": a.external_model_name}
                    for a in with_last4[:5]
                ],
                "hint": "Compare your file values with DB values above. Adviser and Product/Model must match exactly (including spelling). Use 'Download sample from DB' to see full format.",
            }
        return resp
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
