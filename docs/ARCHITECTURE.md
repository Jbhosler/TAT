# Architecture — Tax-Aware Transition Tool (TAT)

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Technology Stack](#2-technology-stack)
3. [Repository Layout](#3-repository-layout)
4. [Backend Architecture](#4-backend-architecture)
5. [Frontend Architecture](#5-frontend-architecture)
6. [Core Algorithms](#6-core-algorithms)
7. [Authentication & Authorization](#7-authentication--authorization)
8. [Asset Classes](#8-asset-classes)
9. [Environment Variables](#9-environment-variables)
10. [Deployment](#10-deployment)

---

## 1. System Overview

TAT is a cloud-native portfolio transition engine for Auour Investments. It has three primary functions:

| Function | Description |
|----------|-------------|
| **Prospect Transition** | Given a client's current holdings and a target strategy, calculate tax-aware sell/buy orders that move the portfolio toward the model while minimising realised gains. |
| **Firm-Wide Monitoring** | Ingest aggregated holdings from the custodian CSV feed, map them to internal strategies, and compute deviation/purity scores across all accounts. |
| **Admin** | Manage strategies (positions, drift limits), product equivalents (GE_Alt), user access, and registration type data. |

```
┌─────────────────────────────────────────────────────────────┐
│                     React Frontend                          │
│  Dashboard (Prospect) │ Monitoring │ Admin │ Scenarios      │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS (Axios)
┌──────────────────────────▼──────────────────────────────────┐
│                    FastAPI Backend                          │
│  /api/auth  /api/strategies  /api/prospects                 │
│  /api/monitoring  /api/admin                                │
└──────────┬──────────────────────────┬───────────────────────┘
           │ SQLAlchemy               │ pure-Python logic
┌──────────▼──────────┐   ┌───────────▼──────────────────────┐
│  Cloud SQL          │   │  backend/logic/                  │
│  PostgreSQL 14      │   │    rebalancer.py                 │
│  (tat_database)     │   │    strategy_blend.py             │
└─────────────────────┘   │    monitor_engine.py             │
                          └──────────────────────────────────┘
```

---

## 2. Technology Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS | HashRouter; served from GCS |
| Backend | Python 3.11+, FastAPI, SQLAlchemy 2, Pydantic v2 | Cloud Run |
| Database | PostgreSQL 14 (Google Cloud SQL) | pg8000 + Cloud SQL Python Connector |
| Auth | Magic-link email (Resend) + HS256 JWT; legacy passcode fallback | 8-hour tokens |
| Deployment | Cloud Build → Cloud Run (backend); GCS + Cloud CDN (frontend) | |
| Email | Resend API | Magic-link delivery |
| Market data | Alpha Vantage | Equivalent Review metrics (optional) |
| PDF generation | ReportLab | Transition report |

---

## 3. Repository Layout

```
TAT/
├── backend/
│   ├── api/
│   │   ├── main.py              # FastAPI app, CORS, middleware, router registration
│   │   ├── deps.py              # get_current_user, require_admin, require_super_admin
│   │   ├── models/
│   │   │   ├── database.py      # SQLAlchemy ORM models + AssetClass/MappingStatus enums
│   │   │   └── schemas.py       # Pydantic request/response models
│   │   └── routes/
│   │       ├── auth.py          # /api/auth
│   │       ├── strategies.py    # /api/strategies
│   │       ├── prospects.py     # /api/prospects
│   │       ├── admin.py         # /api/admin
│   │       └── monitoring.py    # /api/monitoring
│   ├── database/
│   │   └── connection.py        # SQLAlchemy engine (Cloud SQL Connector or proxy)
│   ├── logic/
│   │   ├── rebalancer.py        # Core rebalancing algorithm (Decimal math)
│   │   ├── strategy_blend.py    # Multi-strategy weighted blend
│   │   └── monitor_engine.py    # Monitoring rollup: deviation score, purity score
│   ├── services/
│   │   └── alpha_vantage.py     # Market data fetching for Equivalent Review
│   └── utils/
│       ├── csv_parser.py        # All CSV parsing (strategy, prospect, PE, monitoring, reg-type)
│       ├── asset_classifier.py  # Heuristic: fund vs individual stock
│       └── pdf_generator.py     # ReportLab transition report builder
├── frontend/
│   └── src/
│       ├── App.tsx              # HashRouter routes and auth guard
│       ├── components/
│       │   ├── Dashboard.tsx        # Prospect wizard shell
│       │   ├── MonitoringPage.tsx   # Monitoring tab router
│       │   ├── ScenariosPage.tsx    # Saved prospect list
│       │   ├── ProspectResultPage.tsx
│       │   ├── LandingPage.tsx
│       │   ├── TaxSummary.tsx       # Pre/post holdings + tax tables
│       │   ├── auth/
│       │   ├── prospect/            # Multi-step prospect flow components
│       │   ├── monitoring/          # Per-tab monitoring components
│       │   └── admin/               # Admin panel tabs
│       ├── services/
│       │   └── api.ts               # Axios client + all API groups
│       └── utils/
│           ├── accountNumber.ts     # Masked account number sort helpers
│           └── monitoringNav.ts     # URL-preserving navigation helpers
├── cloud/
│   ├── Dockerfile
│   ├── cloudbuild.yaml          # Cloud Build → Cloud Run deploy
│   ├── cloudrun.yaml            # Cloud Run service spec
│   ├── init-db.sql              # Full schema bootstrap
│   ├── init-db-safe.sql         # Bootstrap with DROP IF EXISTS
│   ├── add-*.sql                # Incremental migrations (apply in order)
│   ├── deploy-backend-and-frontend.ps1
│   ├── deploy-frontend-only.ps1
│   ├── run_single_migration.py  # Runs one .sql file via Cloud SQL Connector
│   └── DB-MIGRATION-CLOUD-SHELL.md
├── tests/
│   ├── test_rebalancer.py
│   ├── test_strategy_blend.py
│   ├── test_monitor_engine.py
│   └── test_monitoring_parser.py
├── docs/                        # ← you are here
├── portal/                      # Separate investor portal (Vite)
├── .env.example
└── requirements.txt
```

---

## 4. Backend Architecture

### 4.1 Application Startup (`backend/api/main.py`)

- FastAPI app instantiated with version `1.0.0`.
- **CORS**: custom HTTP middleware reflects allowed origins (`auourinvest.com`, `localhost:*`, GCS) and a secondary `CORSMiddleware` pass. All exception handlers re-attach CORS headers to ensure preflight responses are never swallowed.
- **Request timing**: middleware logs every request path + duration (metric tag `REQ_METRIC`).
- **Startup**: `Base.metadata.create_all(bind=engine)` runs in a background thread so ORM tables are present on first boot without blocking the event loop.
- Each router is imported with a `try/except` guard so a broken router does not prevent the app from starting.

### 4.2 Route Groups

| Router | Prefix | Auth |
|--------|--------|------|
| `auth.py` | `/api/auth` | Public (except `/me`) |
| `strategies.py` | `/api/strategies` | `get_current_user` |
| `prospects.py` | `/api/prospects` | `get_current_user` |
| `monitoring.py` | `/api/monitoring` | `get_current_user` |
| `admin.py` | `/api/admin` | `require_admin` (user management: `require_super_admin`) |

Health check: `GET /api/health` and `GET /` (root).

### 4.3 Database Connection (`backend/database/connection.py`)

The engine is built lazily the first time `get_engine_lazy()` is called.

| Env config | Connection method |
|------------|-------------------|
| `ENVIRONMENT=production`, `USE_CLOUD_SQL_PROXY=false` | Google Cloud SQL Python Connector + `pg8000` with connection pooling (`DB_POOL_SIZE`, `DB_MAX_OVERFLOW`, etc.) |
| `USE_CLOUD_SQL_PROXY=true` or local dev | Standard `postgresql+pg8000://` DSN against `127.0.0.1:5432` |

`DB_HOST` accepts either a Cloud SQL connection name (`project:region:instance`) or a hostname/IP.

Credentials fetched via `os.environ`; `_clean_secret()` strips BOM characters that can appear when secrets are read from GCP Secret Manager via subprocess.

FastAPI dependency `get_db()` yields a session and closes it on response completion.

### 4.4 Dependency Injection (`backend/api/deps.py`)

```python
get_current_user(credentials, db) -> CurrentUser
    # Accepts: Bearer <jwt>  OR  Bearer authenticated (legacy passcode)
    # JWT: HS256, signed with JWT_SECRET, 8-hour expiry, sub=email, role field
    # Validates: token parse → expiry → authorized_users lookup → is_active

require_admin(current_user) -> CurrentUser   # role in {admin, super_admin}
require_super_admin(current_user) -> CurrentUser
```

`CurrentUser` is a `TypedDict` with `email` and `role` keys and is injected into any route that declares it as a dependency.

---

## 5. Frontend Architecture

### 5.1 Routing (`App.tsx`)

Uses `HashRouter` (required for GCS static hosting — no server-side routing). Auth is read from `localStorage.auth_token`:

- Legacy passcode flow: token stored as the string `"authenticated"` → treated as `super_admin`.
- Magic-link flow: 8-hour HS256 JWT stored; expiry checked client-side by parsing the payload.

Protected routes redirect unauthenticated users to `/`.

### 5.2 API Client (`services/api.ts`)

Single Axios instance. Base URL defaults to the production Cloud Run URL; can be overridden at build time with `VITE_API_URL`.

Auth header is attached from `localStorage` on every request. All API calls are grouped into typed exports:

| Export | Domain |
|--------|--------|
| `authAPI` | Login, magic link, current user |
| `strategiesAPI` | Strategy CRUD, blend preview, bulk upload |
| `prospectsAPI` | Full prospect lifecycle |
| `adminAPI` | Users, asset classes, product equivalents, data integrity |
| `monitoringAPI` | Ingest, accounts, scores, reports, adviser drill-down, equivalent review |

### 5.3 Prospect Wizard Flow

The `Dashboard` component manages state for a multi-step process:

```
Upload CSV / Select holdings
        ↓
Classify holdings (side-pocket vs rebalanceable)
        ↓
Mapping Wizard (unmapped tickers → model tickers + grades)
        ↓
Strategy / Blend selection + account links
        ↓
Calculate (POST /api/prospects/{id}/calculate)
        ↓
TaxSummary (results: sells, buys, pre/post holdings, PDF export)
```

### 5.4 Monitoring Tab Structure

`MonitoringPage` is a single component that renders sub-components based on a `tab` query parameter preserved in the URL. Navigating to an account drill-down carries `tab`, `adviser`, and `as_of_date` in the URL so the Back button returns to the exact view the user left.

| Tab key | Component | Purpose |
|---------|-----------|---------|
| `totalfirm` | `TotalFirm` | Firm-wide summary + sortable account table |
| `heatmap` | `HeatMap` | Visual deviation/purity heat map |
| `concentration` | `ConcentrationReport` | Grade concentration + top offenders |
| `byadviser` | `AccountDetailsByAdviser` | Per-adviser sortable tables; Back restores adviser |
| `uploadchanges` | `UploadChanges` | Ingest CSV + new/changed/removed accounts |
| `unusedequivalents` | `UnusedEquivalents` | PE rows with no matching holdings |
| `equivalentreview` | `EquivalentReview` | Legacy vs model risk/return metrics |

---

## 6. Core Algorithms

### 6.1 Rebalancer (`backend/logic/rebalancer.py`)

All arithmetic uses Python `Decimal` with `PRECISION = Decimal('0.001')` (0.1%) and `ROUND_HALF_UP`.

#### Inputs
- `prospect_data`: holdings list with values, unrealised gain/loss, side-pocket flags, existing mappings.
- `strategy`: positions list `[{model_ticker, asset_class, target_allocation, drift_percentage}]` and product equivalents.

#### Step-by-step

**1. Build strategy lookups**
- Per-ticker targets and asset-class → model-ticker representative maps.
- Asset-class targets aggregated from multi-ticker classes.
- Drift % weight-averaged per asset class.

**2. Classify holdings**
- Forced-sale holdings are separated first.
- Remaining: `is_side_pocket=True` → side pocket (excluded from rebalancing math, carried forward as-is).

**3. Map to model tickers** (priority order)
```
Manual mapping (Option C)  →  explicit user assignment
Product equivalents (PE)   →  legacy_ticker → model_ticker, grade from GE_Alt
CASH                       →  maps to Cash model ticker at grade 0
Unmapped                   →  excluded from buys; carried as-is
```
Multi-asset (dollar-split) mappings distribute one legacy holding across multiple model tickers by configured dollar amounts.

**4. Sell waterfall**

For each overweight asset class (current% > target%):
```
required_sell_value = (current% - target%) / 100 × total_portfolio_value
```
Holdings within that class are sorted:
1. **Grade descending**: sell grade-2 (substitutes) first, then grade-1, then grade-0.
2. **Unrealised gain ascending**: within a grade, sell lowest-gain (or largest-loss) first to minimise tax.
3. **Greedy**: fully liquidate a position when its value ≤ remaining_to_sell, rather than taking a partial.

Forced-sale holdings are sold completely, regardless of class drift.

**5. Buys**
```
buy_value(ticker) = target%(ticker) × total_portfolio_value − current_value(ticker after sells)
```
Cash asset class is never bought explicitly. A `max_spend` cap (= total_sold − cash_target) prevents spending more than was raised; if total buys exceed the cap, all buy amounts are scaled down proportionally.

**6. Cash residual**
```
cash_residual = total_sold − total_bought
```
Swept into the post-portfolio as a single Cash holding. Pre-total and post-total are verified to match.

#### Grade hierarchy summary

| Grade | Meaning | Sell priority |
|-------|---------|--------------|
| 2 | Legacy / substitute (e.g. an old share class, GE_Alt row) | **First** |
| 1 | Close match | Second |
| 0 | Exact model ticker | Last |

---

### 6.2 Strategy Blend (`backend/logic/strategy_blend.py`)

Allows a prospect to target a weighted combination of strategies (e.g. 60% Balanced + 40% Growth).

- Weights must sum to ~100% (2% tolerance).
- Positions are merged **per model ticker** (not per asset class), so two strategies with different tickers in the same class each produce a line.
- Target allocation for a blended position: `strategy_weight/100 × position_target`.
- Drift % is weight-averaged.
- Rounding correction applied to the largest position so the sum is exactly 100%.
- Product equivalents: first-seen per legacy_ticker wins (iteration order = descending weight).
- Version staleness tracked per component strategy; `is_blend_stale()` returns `True` if any constituent has been edited since the calculation.

---

### 6.3 Monitor Engine (`backend/logic/monitor_engine.py`)

Stateless; takes pre-fetched DB data and returns computed metrics.

```python
compute_rollup_and_scores(
    holdings,           # [{ticker, value}]
    cash_value,         # Decimal
    positions,          # [{model_ticker, asset_class, target_allocation}]
    product_equivalents # [{legacy_ticker, model_ticker, grade}]
) -> (actual_pct_by_asset_class, deviation_score, purity_score, holdings_with_metadata)
```

**Mapping logic:**
1. Exact model ticker match → grade 0.
2. Legacy ticker found in PE → mapped asset class + grade.
3. Unmapped → `"Other"`.
4. Cash position → `"Cash"` asset class.

**Deviation score** = Σ |actual% − target%| across all asset classes present in either actual or target.

**Purity score** = total value of grade-0 holdings ÷ total portfolio value × 100.

---

## 7. Authentication & Authorization

### Roles

| Role | Permissions |
|------|-------------|
| `user` | Read/write prospects, strategies, monitoring |
| `admin` | All `user` permissions + admin routes (PE, sanity check, registration type, etc.) |
| `super_admin` | All `admin` permissions + user management (create/edit/deactivate users) |

### Token types

| Type | Format | When used |
|------|--------|-----------|
| Magic-link JWT | HS256 signed with `JWT_SECRET`, 8-hour expiry, `sub=email`, `role` claim | Standard production login |
| Legacy passcode | String `"authenticated"` | Dev/legacy; treated as `super_admin` |

Magic-link flow:
1. User enters email → `POST /api/auth/request-link` → Resend email with token link.
2. User clicks link → `AcceptTokenPage` calls `POST /api/auth/verify-link` → receives JWT → stored in `localStorage`.

---

## 8. Asset Classes

The `AssetClass` enum is the single source of truth (defined in `backend/api/models/database.py`, mirrored in `backend/logic/rebalancer.py`, and enforced at the DB level via `asset_class_enum`).

### Equity (11)
US Large Core · US Large Growth · US Large Value · US Midcap Growth · US Midcap Value · US Small Cap · International Developed · Emerging Markets · Infrastructure · Options Overlay · Real Estate

### Fixed Income (19)
Fixed Income *(legacy bucket)* · Emg Bond LC · Emg Bond Hedged · ST Corp · IT Corp · LT Corp · ST Govt · IT Govt · LT Govt · Tactical Cash · Ultra ST Bond · Aggregate · Mortgage Backed · Inflation Protection · ST High Yield · High Yield · Private Credit · International Bond · Bank Loan · Securitized

### Cash (1)
Cash

**Admin API:** `GET /api/admin/asset-classes` returns the live list from the enum. Frontend dropdowns load from this endpoint and fall back to a hardcoded list if the call fails.

**Adding a new asset class** requires four steps:
1. Add enum member to `backend/api/models/database.py` and `backend/logic/rebalancer.py`.
2. Update `cloud/init-db.sql` and `cloud/init-db-safe.sql`.
3. Create `cloud/add-<name>.sql` with `ALTER TYPE asset_class_enum ADD VALUE IF NOT EXISTS '...'` for existing databases.
4. Update frontend fallback lists in `StrategyEditor.tsx` and `AssetClassMapper.tsx`.

---

## 9. Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `ENVIRONMENT` | `development` | `production` enables Cloud SQL Connector |
| `DB_HOST` | — | Cloud SQL connection name or host IP |
| `DB_NAME` | `tat_database` | Database name |
| `DB_USER` | `tat_user` | Database user |
| `DB_PASSWORD` | — | Database password |
| `USE_CLOUD_SQL_PROXY` | `false` | `true` = local proxy on 5432 |
| `JWT_SECRET` | — | JWT signing key (HS256) |
| `SECRET_KEY` | — | Fallback secret |
| `PASSCODE` | `007` | Legacy passcode auth |
| `ALPHAVANTAGE_API_KEY` | — | Equivalent Review metrics (optional) |
| `FROM_EMAIL` | `noreply@auourinvest.com` | Magic-link sender address |
| `PORTAL_URL` | `https://auourinvest.com` | Magic-link base URL |
| `RESEND_API_KEY` | — | Resend email API |
| `API_PORT` | `8000` | Local dev server port |
| `DB_POOL_SIZE` | `5` | SQLAlchemy pool size |
| `DB_MAX_OVERFLOW` | `10` | Pool max overflow |
| `DB_POOL_TIMEOUT_SECONDS` | `30` | Pool timeout |
| `DB_POOL_RECYCLE_SECONDS` | `1800` | Pool connection recycle interval |
| `VITE_API_URL` | *(Cloud Run URL)* | Frontend build-time API base URL |

> The backend reads environment variables directly from `os.environ`. It does **not** auto-load a `.env` file. Export variables in your shell, use your IDE run configuration, or use the GCP Secret Manager injection (which Cloud Run handles automatically).

---

## 10. Deployment

### GCP resources

| Resource | Name | Purpose |
|----------|------|---------|
| Cloud Run | `tat-backend` (us-central1) | Backend API |
| Cloud SQL | `tat-db-instance` (us-central1) | PostgreSQL 14 |
| Cloud Storage | `tat-frontend-tax-aware-transition-tool` | Frontend assets |
| Cloud Storage | `tat.auourinvest.com` | Custom domain frontend bucket |
| Cloud CDN | `auour-lb` | CDN + HTTPS for custom domain |
| Secret Manager | `db-user`, `db-password`, `jwt-secret`, etc. | Runtime credentials |
| Cloud Build | `cloudbuild.yaml` | CI/CD pipeline |

### Deploy commands (from project root on Windows)

```powershell
# Backend + frontend (most common)
powershell -File cloud\deploy-backend-and-frontend.ps1

# Frontend only (no backend changes)
powershell -File cloud\deploy-frontend-only.ps1

# Single SQL migration on existing database
python cloud\run_single_migration.py cloud\add-some-migration.sql
```

### Database migrations

There is no Alembic chain. Migrations are plain SQL files in `cloud/`:

- **New database**: run `cloud/init-db.sql` (or `init-db-safe.sql` for a destructive reinstall).
- **Existing database**: run only the `add-*.sql` files you have not yet applied. Each uses `IF NOT EXISTS` guards.

See `cloud/DB-MIGRATION-CLOUD-SHELL.md` for step-by-step Cloud Shell instructions.

### Cloud Build pipeline (`cloud/cloudbuild.yaml`)

1. Build Docker image from `cloud/Dockerfile`.
2. Push image to `gcr.io/tax-aware-transition-tool/tat-backend`.
3. Deploy new revision to Cloud Run with Cloud SQL connection, secret bindings, and environment substitutions.
