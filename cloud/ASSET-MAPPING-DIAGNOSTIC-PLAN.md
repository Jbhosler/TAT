# Asset Mapping Save – Diagnostic Plan

Use this plan to determine why Asset Class Mapper saves are not persisting.

---

## Phase 1: Verify Frontend Behavior

### 1.1 Open Browser DevTools (F12)

1. Go to **Admin** → **Asset Class Mapper**
2. Select a strategy
3. Change one asset class in the dropdown
4. Open **Console** tab – note any errors (red text)
5. Open **Network** tab – filter by "Fetch/XHR"
6. Click **Save Mappings**

### 1.2 Check Network Tab

- **Request:** Look for `PUT` to `/api/strategies/{id}`
- **Status:** 200 = success, 4xx/5xx = error
- **Request payload:** Click the request → Payload – verify `positions` includes your changed `asset_class`
- **Response:** Click → Response – verify it returns updated positions with your new asset class

### 1.3 Check Console Tab

- Any red errors before/after clicking Save?
- If you added diagnostic logging (see Phase 3), check for `[AssetMapper]` messages

---

## Phase 2: Verify Backend

### 2.1 Test API Directly (optional)

Use curl or Postman to call the update endpoint:

```bash
# Replace STRATEGY_ID with a real UUID from the app
curl -X PUT "https://tat-backend-vzkn2vygsa-uc.a.run.app/api/strategies/STRATEGY_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Strategy",
    "positions": [
      {"model_ticker": "SPYM", "asset_class": "International Bond", "target_allocation": 100, "drift_percentage": 0}
    ]
  }'
```

- **200 + JSON:** Backend accepts the request
- **422:** Validation error (e.g. invalid asset class)
- **500:** Database or server error

### 2.2 Check Cloud Run Logs

1. Go to [Google Cloud Console](https://console.cloud.google.com) → **Logging** → **Logs Explorer**
2. Filter: `resource.type="cloud_run_revision"` AND `resource.labels.service_name="tat-backend"`
3. Reproduce the save in the app
4. Look for errors around the time of the request (e.g. `Database error`, `invalid input value for enum`)

---

## Phase 3: Likely Causes

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| PUT returns 422 | Invalid asset class (e.g. not in enum) | Run DB migration: `ALTER TYPE asset_class_enum ADD VALUE IF NOT EXISTS 'International Bond'` |
| PUT returns 500 | Database error | Check Cloud Run logs for exact error |
| PUT returns 200 but UI shows old data | Stale closure in `handleMappingChange` | Use functional setState: `setMappings(prev => ...)` |
| No PUT request in Network tab | Save handler not firing or JS error | Check Console for errors |
| CORS or network error | Frontend can't reach backend | Verify `VITE_API_URL` and backend URL |

---

## Phase 4: Database Migration Check

If the asset class is new (e.g. International Bond), the PostgreSQL enum may not include it:

1. Connect via Cloud Shell: `gcloud sql connect tat-db-instance --user=postgres --database=tat_database`
2. Run: `SELECT enumlabel FROM pg_enum WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'asset_class_enum') ORDER BY enumsortorder;`
3. Verify your asset class (e.g. `International Bond`) is in the list
4. If missing, run: `ALTER TYPE asset_class_enum ADD VALUE IF NOT EXISTS 'International Bond';`

---

## Phase 5: Add Diagnostic Logging (Temporary)

Add to `AssetClassMapper.tsx` in `handleSave` (before the try block):

```javascript
console.log('[AssetMapper] Saving:', { strategyId: selectedStrategy.id, positions });
```

And in the catch block:

```javascript
console.error('[AssetMapper] Save failed:', err?.response?.data ?? err);
```

Redeploy and reproduce. Check Console for these messages to confirm:
- What payload is being sent
- Whether an error is thrown and what it contains
