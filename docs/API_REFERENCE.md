# API Reference — Tax-Aware Transition Tool

All endpoints are prefixed with the base URL (Cloud Run: `https://tat-backend-vzkn2vygsa-uc.a.run.app`). Authentication is required on all routes except those marked **public**.

## Authentication

Pass a Bearer token in the `Authorization` header:

```
Authorization: Bearer <jwt>
```

Tokens are obtained via the magic-link flow (`/api/auth/verify-link`) or the legacy passcode flow (`/api/auth/validate`). Tokens expire after 8 hours.

---

## `/api/auth` — Authentication

### `GET /api/auth`
**Public.** Returns `{"status": "ok"}`. Used to verify the auth router is healthy.

### `POST /api/auth/validate`
**Public.** Legacy passcode login.

```json
// Request
{ "passcode": "007" }

// Response
{ "token": "authenticated" }
```

### `POST /api/auth/request-link`
**Public.** Sends a magic-link email to the supplied address if it exists in `authorized_users`.

```json
// Request
{ "email": "user@auourinvest.com" }

// Response  (always 200 to prevent enumeration)
{ "message": "If that email is authorised, a link has been sent." }
```

### `POST /api/auth/verify-link`
**Public.** Verifies a magic-link token and returns a signed JWT.

```json
// Request
{ "token": "<uuid from email link>" }

// Response
{ "access_token": "<hs256-jwt>", "token_type": "bearer" }
```

### `GET /api/auth/me`
**Requires auth.** Returns the current user's email and role.

```json
{ "email": "user@auourinvest.com", "role": "admin" }
```

---

## `/api/strategies` — Strategies

### `GET /api/strategies`
Returns all strategies with their positions.

```json
[{
  "id": "uuid",
  "name": "Balanced Growth",
  "version": 3,
  "positions": [{
    "id": "uuid",
    "model_ticker": "VOO",
    "asset_class": "US Large Core",
    "target_allocation": 40.0,
    "drift_percentage": 5.0
  }]
}]
```

### `GET /api/strategies/{strategy_id}`
Returns one strategy.

### `POST /api/strategies`
Creates a strategy. Positions must sum to 100%.

```json
// Request
{
  "name": "Conservative Income",
  "positions": [
    { "model_ticker": "BND", "asset_class": "Aggregate", "target_allocation": 60.0, "drift_percentage": 5.0 },
    { "model_ticker": "VOO", "asset_class": "US Large Core", "target_allocation": 40.0, "drift_percentage": 5.0 }
  ]
}
```

### `PUT /api/strategies/{strategy_id}`
Replaces a strategy. Increments `version` (triggers stale checks on affected prospects).

### `DELETE /api/strategies/{strategy_id}`
Deletes a strategy and all associated positions.

### `POST /api/strategies/{strategy_id}/bulk-upload`
Replaces all positions from a CSV body (text/plain). CSV format: `Strategy Name,Model Ticker,Asset Class,Target %,Drift %`.

### `POST /api/strategies/blend-preview`
Returns a preview of blended positions without persisting anything.

```json
// Request
{
  "components": [
    { "strategy_id": "uuid-a", "weight": 60 },
    { "strategy_id": "uuid-b", "weight": 40 }
  ]
}

// Response
{
  "display_name": "60% Balanced Growth + 40% Conservative Income",
  "positions": [{
    "model_ticker": "VOO",
    "asset_class": "US Large Core",
    "target_allocation": 36.0,
    "drift_percentage": 5.0,
    "source_strategy": "Balanced Growth"
  }]
}
```

---

## `/api/prospects` — Prospect Transition

### `GET /api/prospects`
Lists all saved prospect scenarios (name, date, total value, strategy).

### `POST /api/prospects/upload`
Creates a new prospect from a CSV holdings file.

| Query param | Type | Description |
|-------------|------|-------------|
| `strategy_id` | UUID | Target strategy |
| `name` | string | Prospect name |
| `strategy_blend` | JSON string | Optional blend `[{strategy_id, weight}]` |

CSV columns: `Ticker`, `Value`, `Unrealized Gain/Loss` (optional), `Account Number` (optional).

### `GET /api/prospects/{prospect_id}`
Returns a prospect with all holdings.

### `DELETE /api/prospects/{prospect_id}`
Deletes a prospect and all cascaded data.

### `PATCH /api/prospects/{prospect_id}/target`
Changes the target strategy or blend without re-uploading holdings.

```json
{ "strategy_id": "uuid", "strategy_blend": null }
```

### `PUT /api/prospects/{prospect_id}/holdings`
Replaces all holdings for a prospect.

### `GET /api/prospects/{prospect_id}/holdings`
Lists all holdings for a prospect.

### `POST /api/prospects/{prospect_id}/classify`
Marks individual holdings as side-pocket (excluded from rebalancing math).

```json
{ "side_pocket_tickers": ["AAPL", "MSFT"] }
```

### `GET /api/prospects/{prospect_id}/unmapped`
Returns holdings that have no product equivalent or manual mapping.

### `GET /api/prospects/{prospect_id}/mapping-review`
Returns holdings where the mapping may need human review (e.g. multi-asset candidates).

### `GET /api/prospects/{prospect_id}/mappings`
Returns all manual ticker mappings (Option C) for this prospect.

### `POST /api/prospects/{prospect_id}/map`
Saves a manual mapping for one legacy ticker.

```json
{
  "legacy_ticker": "VWIGX",
  "model_ticker": "VGK",
  "grade": 1,
  "dollar_split": null
}
```

For multi-asset splits, `dollar_split` is an array:
```json
{
  "legacy_ticker": "FBALX",
  "model_ticker": null,
  "grade": null,
  "dollar_split": [
    { "model_ticker": "VOO", "asset_class": "US Large Core", "value": 60000 },
    { "model_ticker": "BND", "asset_class": "Aggregate", "value": 40000 }
  ]
}
```

### `POST /api/prospects/{prospect_id}/force-sale`
Marks a holding as forced sale (will be fully liquidated).

```json
{ "ticker": "LEGACY_FUND" }
```

### `POST /api/prospects/{prospect_id}/calculate`
Runs the rebalancer and persists a `TransitionResult`. Returns sell orders, buy orders, pre/post holdings, tax summary.

### `GET /api/prospects/{prospect_id}/result`
Returns the latest calculated `TransitionResult`.

```json
{
  "id": "uuid",
  "prospect_id": "uuid",
  "strategy_version": 3,
  "sell_orders": [{ "ticker": "LEGACY", "value": 50000, "gain_loss": -2000, "grade": 2 }],
  "buy_orders": [{ "model_ticker": "VOO", "value": 48000, "asset_class": "US Large Core" }],
  "cash_residual": 2000,
  "total_realized_gain_loss": -2000,
  "pre_holdings": [...],
  "post_holdings": [...]
}
```

### `GET /api/prospects/{prospect_id}/report-pdf`
Generates and returns a portrait PDF transition report (application/pdf).

### `GET /api/prospects/{prospect_id}/stale-check`
Returns `{ "is_stale": true/false }`. Stale when the target strategy/blend version has changed since the last calculation.

### `POST /api/prospects/{prospect_id}/document`
Uploads a prospect document PDF (max 20 MB, multipart/form-data).

### `GET /api/prospects/{prospect_id}/document`
Downloads the stored prospect document PDF.

### `GET /api/prospects/{prospect_id}/linkable-accounts`
Returns monitored accounts that could be linked to this prospect (matching strategy).

### `PATCH /api/prospects/{prospect_id}/link-account`
Links or unlinks a monitored account.

```json
{ "monitored_account_id": "uuid" }   // null to unlink
```

### `GET /api/prospects/{prospect_id}/strategy-account-links`
Returns per-strategy account links (used for blends — each constituent strategy can link to a different monitored account).

### `PUT /api/prospects/{prospect_id}/strategy-account-links`
Updates per-strategy account links.

---

## `/api/admin` — Admin

> **Requires `admin` or `super_admin` role.** User management endpoints require `super_admin`.

### `GET /api/admin/asset-classes`
Returns the full list of valid asset class strings from the enum.

```json
["US Large Core", "US Large Growth", ..., "Cash"]
```

### `GET /api/admin/product-equivalents/{strategy_id}`
Lists all product equivalents (GE_Alt rows) for a strategy.

### `POST /api/admin/product-equivalents/{strategy_id}`
Replaces all product equivalents from a CSV body (GE_Alt format). Triggers a prompt to recalculate monitoring after upload.

### `PATCH /api/admin/product-equivalents/{strategy_id}/{equivalent_id}`
Updates the grade (0, 1, or 2) for one equivalent.

```json
{ "grade": 1 }
```

### `DELETE /api/admin/product-equivalents/{strategy_id}/{equivalent_id}`
Deletes one equivalent.

### `GET /api/admin/sanity-check`
Runs multi-mapping, grade inconsistency, and orphaned model ticker checks across all strategies. Returns a `SanityCheckResponse` with conflict lists.

### `POST /api/admin/sanity-check/preflight`
Runs a sanity check against a proposed PE CSV before committing it.

### `POST /api/admin/replace-model-ticker`
Renames a model ticker everywhere (strategy positions + product equivalents).

```json
{ "old_ticker": "SPY", "new_ticker": "VOO", "strategy_id": "uuid" }
```

### `POST /api/admin/resolve-conflict`
Applies a master mapping for a legacy ticker (resolves multi-mapping conflicts).

### `GET /api/admin/registration-type-sample`
Returns sample monitored accounts for verifying CSV matching before upload.

### `POST /api/admin/registration-type-upload`
Uploads a registration type CSV and enriches matched monitored accounts.

CSV columns: `Advisor`, `Account Number` (or `Account ID`), `Model`, `Registration Type`.
Valid registration types: `Retirement`, `Taxable`, `Trust`.

### `GET /api/admin/authorized-users`
**super_admin only.** Lists all users.

### `POST /api/admin/authorized-users`
**super_admin only.** Creates a user.

```json
{ "email": "new@auourinvest.com", "display_name": "New User", "role": "user" }
```

### `PATCH /api/admin/authorized-users/{email}`
**super_admin only.** Updates a user's display name, role, or active status.

### `DELETE /api/admin/authorized-users/{email}`
**super_admin only.** Deactivates (soft-deletes) a user.

---

## `/api/monitoring` — Monitoring

### Ingest

#### `POST /api/monitoring/ingest`
Ingests a new aggregated holdings CSV. Skips if the file checksum matches the last ingest (deduplication). Pass `?force=true` to bypass.

Returns an `IngestResponse` with counts of new/updated/unchanged accounts.

#### `GET /api/monitoring/last-ingest`
Returns the timestamp and as-of date of the most recent ingest run.

#### `POST /api/monitoring/recalculate`
Recomputes deviation scores and purity scores for all mapped snapshots. Pass `?strategy_id=uuid` to limit to one strategy.

#### `GET /api/monitoring/ingest-changes`
Compares the latest ingest snapshot against the prior one. Returns lists of new accounts, removed accounts, and accounts with material value changes.

---

### Strategy Mapping (Strategy Bridge)

#### `GET /api/monitoring/strategy-mappings`
Lists all `external_model_name → internal_strategy` mappings.

#### `POST /api/monitoring/strategy-mappings`
Creates a mapping.

```json
{ "external_model_name": "BALANCED GROWTH MODEL", "internal_strategy_id": "uuid" }
```

#### `PUT /api/monitoring/strategy-mappings/{mapping_id}`
Updates a mapping.

#### `DELETE /api/monitoring/strategy-mappings/{mapping_id}`
Deletes a mapping.

---

### Accounts & Snapshots

#### `GET /api/monitoring/accounts`
Lists all monitored accounts.

| Query param | Description |
|-------------|-------------|
| `mapped_only` | `true` = only accounts with a strategy mapping |
| `as_of_date` | `YYYY-MM-DD`; defaults to latest snapshot date |

#### `GET /api/monitoring/accounts/search`
Searches accounts by synthetic ID prefix. Returns up to 10 matches.

```
?synthetic_id=****1234
```

#### `GET /api/monitoring/accounts/{account_id}`
Returns account detail: `id`, `synthetic_id`, `friendly_name`, `advisor`, `firm`, `account_display`, `registration_type`, `internal_strategy_id`.

#### `PATCH /api/monitoring/accounts/{account_id}`
Updates `friendly_name` and/or `registration_type`.

```json
{ "friendly_name": "Smith Retirement", "registration_type": "Retirement" }
```

#### `GET /api/monitoring/accounts/{account_id}/snapshots`
Returns all snapshots for an account with asset-class allocation breakdowns.

#### `GET /api/monitoring/accounts/{account_id}/linked-prospects`
Returns prospect scenarios linked to this monitored account.

---

### Firm-Wide Reports

#### `GET /api/monitoring/total-firm`
Returns summary by model and a full account table.

| Query param | Description |
|-------------|-------------|
| `as_of_date` | Snapshot date (default: latest) |
| `limit` / `offset` | Pagination |

#### `GET /api/monitoring/concentration-report`
Returns per-ticker concentration grouped by grade.

#### `GET /api/monitoring/concentration-report/{ticker}/accounts`
Returns all accounts holding a specific ticker at a specific grade.

#### `GET /api/monitoring/top-offenders`
Returns accounts with the highest Grade-2 dollar volume.

#### `GET /api/monitoring/unmapped-tickers`
Returns tickers present in snapshots that are not in any product equivalent or strategy position.

#### `GET /api/monitoring/unmapped-tickers/{ticker}/accounts`
Returns accounts holding a specific unmapped ticker.

---

### Equivalent Usage

#### `GET /api/monitoring/unused-equivalents`
Returns product equivalent rows that have no matching holdings in the latest snapshot.

#### `GET /api/monitoring/equivalents-usage`
Returns all product equivalents with usage statistics (count of accounts, total value, retirement-only flag).

#### `GET /api/monitoring/equivalents-usage/{equivalent_id}/accounts`
Returns accounts holding a specific equivalent.

---

### Adviser Drill-Down

#### `GET /api/monitoring/advisers`
Returns a sorted list of distinct adviser names from monitored accounts.

#### `GET /api/monitoring/adviser-accounts`
Returns full detail for all accounts belonging to one adviser.

| Query param | Required | Description |
|-------------|----------|-------------|
| `adviser` | Yes | Adviser name (exact match, case-insensitive) |
| `as_of_date` | No | Snapshot date; defaults to latest |

Response:
```json
{
  "summary": { "total_accounts": 12, "total_aum": 4500000, "accounts_with_equivalents": 7 },
  "summary_by_strategy": [{ "strategy_name": "Balanced", "account_count": 8, "total_value": 3200000 }],
  "accounts": [{
    "account_id": "uuid",
    "partial_account_number": "*****1234",
    "account_value": 375000,
    "has_equivalents": true,
    "strategy_name": "Balanced",
    "registration_type": "Retirement"
  }],
  "legacy_totals": [{ "legacy_ticker": "LEGACY_ETF", "total_value": 120000, "account_count": 4 }]
}
```

---

### Equivalent Review

#### `GET /api/monitoring/equivalent-review`
Returns product equivalents merged with stored AlphaVantage performance metrics.

| Query param | Description |
|-------------|-------------|
| `strategy_id` | Filter to one strategy (optional) |

#### `POST /api/monitoring/equivalent-review/{equivalent_id}/refresh`
Fetches updated metrics from AlphaVantage for one legacy/model ticker pair and persists them.

---

## Error Responses

All errors return JSON:

```json
{ "detail": "Human-readable error message" }
```

| HTTP status | Meaning |
|-------------|---------|
| 400 | Bad request / validation error |
| 401 | Missing or invalid token |
| 403 | Insufficient role |
| 404 | Resource not found |
| 422 | Pydantic validation failure (field-level errors) |
| 500 | Unexpected server error |
