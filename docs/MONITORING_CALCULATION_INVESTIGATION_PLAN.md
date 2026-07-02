# Monitoring Calculation: Medium & High Effort Investigation Plan

**Context:** Aggregated holdings are uploaded once per day for all strategies. Product equivalents are updated less frequently (e.g., when GE_Alt.csv changes or grades are adjusted).

**Completed (Low Effort):**
- Single query for positions/PE in recalculate (reduces DB round-trips from O(strategies) to O(1))
- Chunked processing: recalculate processes 500 snapshots at a time to limit memory (avoids OOM)
- ProcessPoolExecutor was tried but reverted—spawned processes caused memory bloat (933 MiB vs 512 MiB limit). Using ThreadPoolExecutor only.

---

## Medium Effort Items

### 1. Batch Holdings Inserts in Ingest

**Status (updated):** Ingest now collects holdings and uses `db.bulk_insert_mappings(AccountSnapshotHolding, ...)` (see `ingest_aggregated_holdings` in `backend/api/routes/monitoring.py`). Further work, if needed: tune batch sizes for commits, profile remaining per-account work, or reduce flush frequency.

**Original issue:** Per-holding `db.add()` caused excessive round-trips at scale.

**Residual investigation:**
1. Add timing logs around ingest phases (parse, account upsert, bulk insert, rollup compute) if hotspots are unclear
2. If memory or transaction length is still an issue, split bulk inserts into chunks (e.g., by account batches)

**Files to review:** `backend/api/routes/monitoring.py` (`ingest_aggregated_holdings` and related helpers)

**Risk:** Low for further batching tweaks; same data, different chunking.

---

### 2. Parallel Compute During Ingest

**Current behavior:** Ingest runs `compute_rollup_and_scores` sequentially for each mapped account in the loop.

**Proposed change:**
- Pre-load all strategy positions and product equivalents (similar to recalculate)
- Build work items for all mapped accounts
- Run `compute_rollup_and_scores` in parallel (ProcessPoolExecutor when account count ≥ 100)
- Write results in batches (aligned with batch holdings insert above)

**Investigation steps:**
1. Profile ingest to confirm compute is a meaningful fraction of total time (vs. DB I/O)
2. If compute is significant, apply the same parallel pattern used in recalculate
3. Ensure positions/PE are loaded once and cached (already partially done via `_get_positions_and_pe`)

**Files to modify:** `backend/api/routes/monitoring.py` (`ingest_aggregated_holdings` and related helpers)

**Risk:** Low. Logic unchanged; execution parallelized.

---

### 3. Float vs. Decimal for Calculation

**Current behavior:** All monetary and percentage math uses `Decimal` for precision. `Decimal` is slower than `float` for arithmetic.

**Proposed change:**
- Use `float` for intermediate calculations in `compute_rollup_and_scores`
- Round to 2–3 decimal places for storage/display
- Validate that precision is acceptable for reporting (e.g., 0.1% drift tolerance)

**Investigation steps:**
1. Document current precision requirements (e.g., "0.1% standard" in codebase)
2. Run a sample of accounts with both `Decimal` and `float` and diff outputs
3. If differences are negligible, benchmark `float` vs `Decimal` in a tight loop
4. If meaningful speedup, refactor `monitor_engine.py` to use `float` internally

**Files to modify:** `backend/logic/monitor_engine.py`, possibly `backend/api/models/database.py` if column types change

**Risk:** Medium. Requires validation that precision remains acceptable.

---

## High Effort Items

### 4. Background Job for Recalculate

**Current behavior:** Recalculate runs synchronously in the HTTP request. Long runs can hit Cloud Run timeout (900s) or cause poor UX (user waits, connection drops).

**Proposed change:**
- Add a job queue (e.g., Cloud Tasks or Pub/Sub)
- `POST /api/monitoring/recalculate` enqueues a task and returns `202 Accepted` with `job_id`
- Worker (Cloud Run job or Cloud Function) processes recalculate asynchronously
- `GET /api/monitoring/recalculate/status/{job_id}` returns status (pending, running, completed, failed)

**Investigation steps:**
1. Choose queue: Cloud Tasks (simpler, good for one-off jobs) vs. Pub/Sub (better for fan-out)
2. Design job payload: `strategy_id` (optional), `requested_at`, `job_id`
3. Add `monitoring_recalculate_jobs` table: `job_id`, `status`, `recalculated_count`, `started_at`, `completed_at`, `error`
4. Implement worker that pulls task, runs recalculate logic, updates job status
5. Frontend: after product equivalents upload, call recalculate → get `job_id` → poll status or show "Recalculation started; refresh in a few minutes"

**Files to create/modify:**
- New: `backend/api/routes/monitoring_jobs.py` or extend monitoring routes
- New: Cloud Tasks queue + worker (e.g., `cloud/tasks/recalculate_worker.py` or Cloud Run job)
- DB migration: `monitoring_recalculate_jobs` table
- Frontend: `ProductEquivalents.tsx`, `api.ts` (recalculate returns job_id, add status poll)

**Risk:** Medium–High. New infrastructure, more moving parts. High payoff for reliability at scale.

---

## Recommended Order of Investigation

| Order | Item                         | Effort | When to prioritize                          |
|-------|------------------------------|--------|---------------------------------------------|
| 1     | Batch holdings inserts       | Medium | When ingest becomes slow (>2–3 min)         |
| 2     | Parallel compute in ingest   | Medium | When ingest compute time is significant     |
| 3     | Background job for recalc   | High   | When recalc still times out or UX suffers   |
| 4     | Float vs. Decimal            | Medium | When profiling shows math as bottleneck      |

---

## Usage Assumptions (for prioritization)

- **Aggregated holdings:** Uploaded once per day for all strategies → ingest optimization (items 1–2) matters most for daily workflow
- **Product equivalents:** Updated less often → recalculate runs less frequently; background job (item 4) improves UX when it does run
- **Scale:** If account count grows (e.g., 10k+ snapshots), batch + parallel + background job become more important

---

## Quick Profiling Commands

To measure where time is spent before investing in changes:

```python
# Add to recalculate or ingest (temporary):
import time
t0 = time.perf_counter()
# ... load snapshots ...
logger.info("Load snapshots: %.2fs", time.perf_counter() - t0)
t1 = time.perf_counter()
# ... parallel compute ...
logger.info("Compute: %.2fs", time.perf_counter() - t1)
t2 = time.perf_counter()
# ... DB updates ...
logger.info("DB updates: %.2fs", time.perf_counter() - t2)
```

Run with a representative dataset and check Cloud Run logs for the breakdown.
