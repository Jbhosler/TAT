# Upload Review & GCP Test/Fix Plan

## 1. Upload Flow Review

### 1.1 Aggregated Holdings Upload

| Layer | Component | Path / Endpoint |
|-------|-----------|-----------------|
| **Frontend** | `AggregatedHoldingsUpload.tsx` | Admin → Holdings tab |
| **API** | `monitoringAPI.ingest()` | `POST /api/monitoring/ingest` |
| **Backend** | `ingest_aggregated_holdings()` | `backend/api/routes/monitoring.py:250` |
| **Parser** | `parse_aggregated_holdings_csv()` | `backend/utils/csv_parser.py:329` |

**Flow:**
1. User selects CSV file → `FileReader.readAsText(file, 'UTF-8')`
2. Frontend sends raw CSV body with `Content-Type: text/csv`
3. Backend reads `request.body()`, decodes `utf-8-sig`, parses with `parse_aggregated_holdings_csv()`
4. Backend upserts accounts, snapshots, holdings; records `MonitoringIngestRun`

**Key details:**
- Always uses `force: true` in frontend (line 44 of AggregatedHoldingsUpload.tsx)
- Duplicate file detection via SHA256 checksum; skipped unless `force=true`
- Expected CSV format: Account, Advisor, Model, Firm, Enterprise, Ticker, Market Val, Cash As Position, As Of Date

---

### 1.2 Product Equivalents Upload

| Layer | Component | Path / Endpoint |
|-------|-----------|-----------------|
| **Frontend** | `ProductEquivalents.tsx` | Admin → Product Equivalents tab |
| **API** | `adminAPI.uploadProductEquivalents()` | `POST /api/admin/product-equivalents/{strategy_id}` |
| **Backend** | `upload_product_equivalents()` | `backend/api/routes/admin.py:166` |
| **Parser** | `parse_product_equivalents_csv()` | `backend/utils/csv_parser.py:156` |

**Flow:**
1. User selects strategy, uploads CSV → `FileReader.readAsText(file)`
2. **Preflight:** `POST /api/admin/sanity-check/preflight` with JSON `{ strategy_id, csv_content }`
3. **Upload:** `POST /api/admin/product-equivalents/{strategy_id}` with raw CSV body, `Content-Type: text/csv`
4. Backend deletes existing equivalents, inserts new ones, commits
5. Frontend calls `monitoringAPI.recalculate({ strategy_id })` after upload

**Key details:**
- Preflight uses JSON body; upload uses raw CSV body (different Content-Types)
- Expected CSV format: Ticker, Alternate, Buy Control, Sell Control, Custodian, Notes, Description (Grade optional)

---

## 2. GCP-Specific Risk Areas

### 2.1 CORS (Cross-Origin)

- **Frontend:** Hosted on Cloud Storage (`storage.googleapis.com/tat-frontend-...`)
- **Backend:** Cloud Run (`tat-backend-xxxxx-uc.a.run.app`)
- **Risk:** Browser blocks requests if CORS preflight (OPTIONS) fails or response lacks correct headers

**Current config:** `main.py` has CORS middleware with `allow_origins=["*"]`, custom `cors_handler` for OPTIONS. `storage.googleapis.com` is in `ALLOWED_ORIGINS`.

### 2.2 Request Size Limits

- **Cloud Run default:** 32 MB max request body
- **Aggregated holdings:** Can be large (e.g. rows6923.csv with thousands of rows)
- **Product equivalents:** Typically smaller (hundreds of rows)

**Risk:** Very large CSV uploads may hit 413 Payload Too Large or timeout.

### 2.3 Request Timeout

- **Cloud Run default:** 5 minutes (300 seconds)
- **Ingest:** Can be slow for large files (DB writes, monitor_engine processing)
- **Product equivalents:** Usually fast

**Risk:** Long-running ingest may timeout before completion.

### 2.4 Content-Type Handling

- **Ingest:** Expects raw body; FastAPI does not parse as JSON
- **Product equivalents upload:** Same — raw CSV
- **Preflight:** Expects JSON `{ strategy_id, csv_content }`

**Risk:** If frontend sends wrong Content-Type or axios serializes body incorrectly, backend may receive malformed data.

### 2.5 Database (Cloud SQL)

- Ingest and product equivalents both perform DB writes
- **Risk:** Connection pool exhaustion, Cloud SQL Connector issues, transaction timeouts

---

## 3. Path to Test and Fix (GCP Only)

All testing is done against GCP (Cloud Run backend, Cloud Storage frontend). No local runs.

### Phase 1: GCP Direct API Tests (Bypass Frontend)

Use PowerShell or curl to isolate backend behavior on Cloud Run.

**A. Health check:**
```powershell
Invoke-RestMethod -Uri "https://tat-backend-vzkn2vygsa-uc.a.run.app/api/health"
```

**B. CORS preflight for ingest:**
```powershell
$headers = @{
  "Origin" = "https://storage.googleapis.com"
  "Access-Control-Request-Method" = "POST"
  "Access-Control-Request-Headers" = "content-type"
}
Invoke-WebRequest -Uri "https://tat-backend-vzkn2vygsa-uc.a.run.app/api/monitoring/ingest" -Method OPTIONS -Headers $headers -UseBasicParsing
```

**C. CORS preflight for product equivalents:**
```powershell
Invoke-WebRequest -Uri "https://tat-backend-vzkn2vygsa-uc.a.run.app/api/admin/product-equivalents/SOME-UUID" -Method OPTIONS -Headers $headers -UseBasicParsing
```

**D. Actual ingest (small CSV):**
```powershell
$csv = "Ticker,Market Val,Cash As Position,Account,Model,Advisor,Firm,Enterprise,As Of Date`nWFMIX,1498.59,13532.47,****5038,Auour Instinct,Worthington,Cetera,Cetera,28-Jan-26"
Invoke-RestMethod -Uri "https://tat-backend-vzkn2vygsa-uc.a.run.app/api/monitoring/ingest?force=true" -Method POST -Body $csv -ContentType "text/csv" -Headers @{"Origin"="https://storage.googleapis.com"}
```

**E. Product equivalents upload (need real strategy_id):**
```powershell
$csv = "Ticker,Alternate`nSPYM,LEG"
# Replace STRATEGY_UUID with actual strategy ID from GET /api/strategies
Invoke-RestMethod -Uri "https://tat-backend-vzkn2vygsa-uc.a.run.app/api/admin/product-equivalents/STRATEGY_UUID" -Method POST -Body $csv -ContentType "text/csv" -Headers @{"Origin"="https://storage.googleapis.com"}
```

---

### Phase 2: Browser-Based Tests (Production Frontend)

1. Open production frontend: `https://storage.googleapis.com/tat-frontend-tax-aware-transition-tool/index.html`
2. Open DevTools → Network tab
3. **Aggregated Holdings:**
   - Select CSV, click Ingest
   - Check: OPTIONS request returns 200 with CORS headers
   - Check: POST returns 200 (or 400 with parse error)
   - If CORS error: backend not returning correct headers
   - If 422: body serialization issue (axios may be double-encoding)
4. **Product Equivalents:**
   - Select strategy, upload CSV
   - Check preflight (JSON) and upload (CSV) requests
   - If preflight 422: JSON body format issue
   - If upload 422: CSV body format issue

---

### Phase 3: Common Fixes

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| CORS error in console | OPTIONS not handled or wrong headers | Verify `cors_handler` in `main.py` runs first; ensure `Access-Control-Allow-Origin` on all responses |
| 422 Unprocessable Entity on ingest | FastAPI parsing body as JSON | Endpoint uses `Request` and `request.body()` — should be fine. Check axios isn't sending `Content-Type: application/json` |
| 413 Payload Too Large | Request exceeds Cloud Run limit | Increase `--max-instances` or split upload; or use Cloud Storage + backend pull |
| Timeout on large ingest | Request exceeds 5 min | Add `--timeout` to Cloud Run deploy; or process async (upload to GCS, trigger Cloud Function) |
| "Failed to load" / network error | Backend URL wrong | Verify `VITE_API_URL` in frontend build points to Cloud Run URL |
| Database errors in logs | Cloud SQL Connector / connection | Check Cloud Run service account has `roles/cloudsql.client`; verify connection name in cloudbuild |

---

## 4. Test Script

Run `cloud/test-uploads.ps1` to automate Phase 1 (direct Cloud Run) tests.

---

## 5. Next Steps

1. **Run Phase 1** — Direct API calls to Cloud Run (health, CORS, ingest POST). Use `cloud/test-uploads.ps1`.
2. **Run Phase 2** — Browser tests from production frontend on Cloud Storage.
3. **Check Cloud Run logs** — `gcloud run services logs read tat-backend --region=us-central1` for errors during upload.
4. **If issues found** — Apply fixes from Phase 3 table, redeploy backend if needed, re-test.
