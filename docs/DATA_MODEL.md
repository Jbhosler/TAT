# Data Model — Tax-Aware Transition Tool

This document describes every database table, its columns, relationships, and the enums it uses.

The schema is managed via plain SQL files in `cloud/`. SQLAlchemy `create_all()` handles ORM-mapped tables on startup, but **enums and one-off columns still require the SQL migration files** — there is no Alembic chain.

---

## Enums

### `asset_class_enum`

Controls which asset classes are valid in strategy positions and snapshot holdings. See [ARCHITECTURE.md § Asset Classes](ARCHITECTURE.md#8-asset-classes) for the full list.

### `mapping_status_enum`

| Value | Meaning |
|-------|---------|
| `mapped` | Holding has a product equivalent or manual mapping |
| `unmapped` | No mapping found |
| `multi_asset` | Manual dollar-split across multiple model tickers |
| `forced_sale` | User has marked this holding for full liquidation |

---

## Tables

### `strategies`

The core model portfolio definition.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `name` | VARCHAR(255) | Unique display name |
| `version` | INTEGER | Increments on every `PUT`; used for stale-detection on prospects |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**Relationships:** one → many `strategy_positions`, `product_equivalents`, `prospects`, `monitored_accounts`, `strategy_name_mappings`.

---

### `strategy_positions`

One row per model ticker in a strategy.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `strategy_id` | UUID FK → `strategies` | Cascade delete |
| `model_ticker` | VARCHAR(50) | e.g. `VOO` |
| `asset_class` | `asset_class_enum` | |
| `target_allocation` | NUMERIC(6,3) | Percentage; positions per strategy should sum to 100 |
| `drift_percentage` | NUMERIC(6,3) | Maximum allowed drift before rebalancing is triggered |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

---

### `product_equivalents`

GE_Alt table — maps legacy tickers to model tickers within a strategy.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `strategy_id` | UUID FK → `strategies` | Cascade delete |
| `legacy_ticker` | VARCHAR(50) | Ticker held by the client |
| `model_ticker` | VARCHAR(50) | Target ticker for this position |
| `grade` | INTEGER (nullable) | 0 = exact match, 1 = close match, 2 = substitute/legacy |
| `buy_control` | VARCHAR(100) | Optional buy restriction note |
| `sell_control` | VARCHAR(100) | Optional sell restriction note |
| `custodian` | VARCHAR(100) | |
| `notes` | TEXT | |
| `description` | TEXT | |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

**Unique constraint:** `(strategy_id, legacy_ticker, model_ticker)`.

---

### `equivalent_metrics`

AlphaVantage performance data for one PE pair.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `equivalent_id` | UUID FK → `product_equivalents` | Cascade delete; unique |
| `last_updated` | TIMESTAMPTZ | When the metrics were last fetched |
| `leg_ret_1y/3y/5y` | NUMERIC | Legacy ticker returns |
| `leg_vol` | NUMERIC | Legacy volatility |
| `leg_mdd` | NUMERIC | Legacy max drawdown |
| `mod_ret_1y/3y/5y` | NUMERIC | Model ticker returns |
| `mod_vol` | NUMERIC | Model volatility |
| `mod_mdd` | NUMERIC | Model max drawdown |
| `correlation_1y` | NUMERIC | 1-year correlation between legacy and model |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

---

### `prospects`

A prospect scenario (client transition analysis).

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `strategy_id` | UUID FK → `strategies` (nullable) | Primary target strategy; null for pure blends |
| `strategy_blend` | JSONB (nullable) | `[{strategy_id, weight, version?}]` for blended targets |
| `strategy_account_links` | JSONB (nullable) | `{strategy_id: account_id}` per blend constituent |
| `name` | VARCHAR(255) | Prospect / client name |
| `total_value` | NUMERIC | Portfolio total value |
| `classification_completed` | BOOLEAN | True after side-pocket choices have been explicitly reviewed; reset when holdings change |
| `document_pdf` | BYTEA (nullable) | Uploaded prospect document |
| `document_filename` | VARCHAR(255) | |
| `monitored_account_id` | UUID FK → `monitored_accounts` (nullable) | Linked monitoring account (legacy single-link) |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

---

### `prospect_holdings`

Individual holdings uploaded for a prospect.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `prospect_id` | UUID FK → `prospects` | Cascade delete |
| `ticker` | VARCHAR(50) | |
| `value` | NUMERIC | Dollar value |
| `unrealized_gain_loss` | NUMERIC | Embedded gain/loss (negative = loss) |
| `is_side_pocket` | BOOLEAN | If true, excluded from rebalancing but shown in output |
| `mapping_status` | `mapping_status_enum` | |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

---

### `ticker_mappings`

Manual Option C mappings — user-assigned ticker → model ticker overrides for a prospect.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `prospect_id` | UUID FK → `prospects` | Cascade delete |
| `legacy_ticker` | VARCHAR(50) | The held ticker |
| `model_ticker` | VARCHAR(50) (nullable) | Target; null when `dollar_split` is used |
| `grade` | INTEGER (nullable) | |
| `dollar_split` | JSONB (nullable) | `[{model_ticker, asset_class, value}]` for multi-asset splits |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

**Unique constraint:** `(prospect_id, legacy_ticker)`.

---

### `transition_results`

Calculated output from the rebalancer for a prospect.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `prospect_id` | UUID FK → `prospects` | Cascade delete |
| `strategy_version` | INTEGER | Version of the primary strategy when calculated |
| `strategy_versions_snapshot` | JSONB | `{strategy_id: version}` for all blend constituents |
| `target_positions` | JSONB | `[{model_ticker, asset_class, target_allocation}]` |
| `sell_orders` | JSONB | `[{ticker, value, gain_loss, grade}]` |
| `buy_orders` | JSONB | `[{model_ticker, value, asset_class}]` |
| `cash_residual` | NUMERIC | Uninvested proceeds |
| `total_realized_gain_loss` | NUMERIC | Sum of all realised gains/losses from sells |
| `pre_holdings` | JSONB | Full pre-trade holdings snapshot |
| `post_holdings` | JSONB | Full post-trade holdings snapshot |
| `equivalent_usage` | JSONB | Audit rows mapping legacy → model tickers |
| `pdf_additional_text` | TEXT (nullable) | Optional text appended to the PDF report footer |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

---

### `strategy_name_mappings`

Bridges the custodian's external model name to an internal strategy (Strategy Bridge).

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `external_model_name` | VARCHAR(255) UNIQUE | Name as it appears in the ingest CSV |
| `internal_strategy_id` | UUID FK → `strategies` (nullable) | |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

---

### `discovery_models`

Tracks all external model names seen in ingest runs, whether or not they have been mapped.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `external_model_name` | VARCHAR(255) UNIQUE | |
| `internal_strategy_id` | UUID FK (nullable) | Set when mapped via Strategy Bridge |
| `last_seen` | TIMESTAMPTZ | Updated on each ingest |
| `is_active` | BOOLEAN | False if absent from recent ingests |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

---

### `monitored_accounts`

One row per account in the firm's aggregated holdings file.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `synthetic_id` | VARCHAR(255) UNIQUE | Deterministic hash from advisor + last4 + model |
| `friendly_name` | VARCHAR(255) (nullable) | User-assigned label |
| `internal_strategy_id` | UUID FK → `strategies` (nullable) | Set from strategy name mapping |
| `external_model_name` | VARCHAR(255) (nullable) | As ingested |
| `firm` | VARCHAR(255) (nullable) | |
| `advisor` | VARCHAR(255) (nullable) | |
| `account_display` | VARCHAR(255) (nullable) | Masked account number e.g. `*****1234` |
| `registration_type` | VARCHAR(50) (nullable) | `Retirement`, `Taxable`, `Trust` |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

---

### `account_snapshots`

One row per account per ingest date after recalculation.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `monitored_account_id` | UUID FK → `monitored_accounts` | |
| `as_of_date` | DATE | Ingest date |
| `total_value` | NUMERIC | |
| `total_deviation_score` | NUMERIC | Σ \|actual% − target%\| across all asset classes |
| `purity_score` | NUMERIC | % of portfolio in grade-0 holdings |
| `cash_pct` | NUMERIC | % in cash |
| `is_unmapped` | BOOLEAN | True when account has no strategy mapping |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

**Unique constraint:** `(monitored_account_id, as_of_date)`.

---

### `account_snapshot_holdings`

Individual holding rows within a snapshot.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `account_snapshot_id` | UUID FK → `account_snapshots` | Cascade delete |
| `ticker` | VARCHAR(50) | |
| `asset_class` | VARCHAR(100) (nullable) | Resolved from PE or direct model ticker match |
| `value` | NUMERIC | Dollar value |
| `weight_pct` | NUMERIC (nullable) | % of account total |
| `grade` | INTEGER (nullable) | 0/1/2 from PE; 0 if direct model ticker match |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

---

### `monitoring_ingest_runs`

Tracks ingest history for deduplication and last-ingest display.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `ingested_at` | TIMESTAMPTZ | Wall time of ingest |
| `ingested_count` | INTEGER | Number of accounts processed |
| `as_of_date` | DATE (nullable) | Date parsed from file or derived from data |
| `file_checksum` | VARCHAR(64) (nullable) | SHA-256 of the raw file; duplicate = skip |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

---

### `authorized_users`

User accounts for magic-link authentication.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `email` | VARCHAR(255) UNIQUE | |
| `display_name` | VARCHAR(255) (nullable) | |
| `role` | VARCHAR(50) | `user`, `admin`, `super_admin` |
| `is_active` | BOOLEAN | Deactivated users cannot log in |
| `added_by` | VARCHAR(255) (nullable) | Email of the user who created this record |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

---

### `magic_link_tokens`

Short-lived tokens for the magic-link email login flow.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `email` | VARCHAR(255) | Matches `authorized_users.email` |
| `token_hash` | VARCHAR(255) UNIQUE | SHA-256 of the raw UUID token |
| `expires_at` | TIMESTAMPTZ | 15-minute expiry |
| `used_at` | TIMESTAMPTZ (nullable) | Set on first use; tokens are single-use |
| `created_at` | TIMESTAMPTZ | |

---

## Entity Relationship Summary

```
strategies ──< strategy_positions
           ──< product_equivalents ──< equivalent_metrics
           ──< prospects
           ──< strategy_name_mappings
           ──< monitored_accounts

prospects ──< prospect_holdings
          ──< ticker_mappings
          ──< transition_results
          ──  monitored_accounts (FK; single-link legacy)

monitored_accounts ──< account_snapshots ──< account_snapshot_holdings

discovery_models ──  strategies (FK; nullable)

authorized_users ──< magic_link_tokens
```

---

## Migration History

Migrations are accumulated `.sql` files in `cloud/`. They must be applied in the order listed in `cloud/DB-MIGRATION-CLOUD-SHELL.md`. Key milestones:

| File | Adds |
|------|------|
| `init-db.sql` | Complete initial schema |
| `add-fixed-income-asset-classes.sql` | FI sub-class enum values |
| `add-international-bond.sql` | `International Bond` enum value |
| `add-equity-and-fi-asset-classes.sql` | `Infrastructure`, `Options Overlay`, `Real Estate`, `Bank Loan`, `Securitized` |
| `add-auth-tables.sql` | `authorized_users`, `magic_link_tokens` |
| `add-monitoring-tables.sql` | Monitoring tables |
| `add-prospect-strategy-blend.sql` | `strategy_blend`, `strategy_account_links` on `prospects` |
| `add-prospect-classification-completed.sql` | `classification_completed` on `prospects` |
| `add-transition-equivalent-usage.sql` | `equivalent_usage` on `transition_results` |
| `add-transition-result-pdf-additional-text.sql` | `pdf_additional_text` on `transition_results` |

> For a new database, run only `init-db.sql` — it already includes all historical additions. For an existing database, apply only the `add-*.sql` files you have not yet run.
