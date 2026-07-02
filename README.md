# Auour Tax-Aware Transition Tool

A cloud-native portfolio transition engine for Auour Investments that maintains portfolio purity while minimizing tax realization.

## Architecture

- **Core Logic**: Pure Python module (`backend/logic/rebalancer.py`) with no dependencies on API/UI
- **API Layer**: FastAPI for HTTP requests and database operations
- **Database**: PostgreSQL (Google Cloud SQL)
- **Frontend**: React (Vite) with Tailwind CSS
- **Security**: Passcode gate (007) on landing page
- **Deployment**: Google Cloud Run (backend) + Cloud Storage/Cloud CDN (frontend)

## Features

### Admin Panel
- **Manual Strategy Editor**: Edit strategies, positions, allocations, and drift parameters
- **Bulk Upload**: CSV ingestion to update entire strategy models
- **Asset Class Mapping**: Map Model Tickers to asset classes
- **Product Equivalents**: Upload/manage GE_Alt.csv files per strategy
- **Registration type upload**: CSV used to enrich monitored accounts (admin UI)

### Prospect Transition Engine
- **Holdings classification**: Review holdings and mark side pockets (individual stocks) vs funds before mapping
- **Option C Mapping**: Manual mapping wizard for unmapped tickers
- **Multi-Asset Splits**: Support for funds that map to multiple Model Tickers
- **Documents & reports**: Optional prospect document upload; transition PDF report download
- **Link to monitoring**: Attach a prospect to a monitored account when both exist in the system
- **Tax-Aware Rebalancing**: 
  - Grade hierarchy: Grade 2 → Grade 1 → Grade 0
  - Sell to Upper Drift Limit (not midpoint)
  - Greedy elimination: Prefer 100% liquidation when possible
  - 0.1% precision for all calculations

### Monitoring (firm-wide)
- Aggregated holdings CSV ingest, checksum-based skip, optional force recompute
- Strategy name mapping (external model → internal strategy), discovery models
- Account snapshots, heat map / rollup scores, concentration and “top offenders” views
- Equivalent usage (including unused equivalents), unmapped tickers, by-adviser breakdowns
- Equivalent Review (legacy vs model metrics; Alpha Vantage refresh when configured)
- Registration type CSV upload for monitored accounts

### Dashboard
- Side-by-side Current vs Proposed portfolio comparison
- Tax summary with realized gains/losses
- Stale data warnings when strategies are updated

## Setup

### Prerequisites
- Python 3.11+
- Node.js 18+
- PostgreSQL 14+ (or Google Cloud SQL)
- Google Cloud SDK (for deployment)

### Backend Setup

1. Create virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Configure environment variables (see `.env.example` for names and defaults). The backend reads `os.environ` only; it does not load a `.env` file automatically—export variables in your shell, use your IDE’s run configuration, or inject them the same way Cloud Run does.

4. Database schema:
   - **Cloud / shared DB:** Apply SQL in `cloud/` (start with `init-db.sql` or `init-db-safe.sql`, then any incremental `add-*.sql` your instance needs). See `cloud/DB-MIGRATION-CLOUD-SHELL.md`.
   - **Local dev:** On API startup, SQLAlchemy `create_all` ensures ORM tables exist against your configured database (use the same scripts if you need enums, triggers, or columns not covered by the models).

5. Start the API server:
```bash
uvicorn backend.api.main:app --reload
```

### Frontend Setup

1. Navigate to frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Start development server:
```bash
npm run dev
```

By default the dev server calls `http://localhost:8000`. For production builds, set `VITE_API_URL` to your Cloud Run URL (see root `DEPLOYMENT.md`).

## Google Cloud Deployment

### Cloud SQL Setup
1. Create PostgreSQL instance in Google Cloud SQL
2. Create database and user
3. Store credentials in Secret Manager
4. Configure Cloud SQL Proxy for local development

### Cloud Run Backend
1. Build Docker image with `cloud/Dockerfile`
2. Push to Google Container Registry/Artifact Registry
3. Deploy to Cloud Run with Cloud SQL connection configured

### Frontend Deployment
1. Build production bundle: `npm run build`
2. Upload `dist/` to Cloud Storage bucket
3. Configure Cloud CDN for static assets

See `DEPLOYMENT.md`, `QUICK_START.md`, and `cloud/TROUBLESHOOTING-INDEX.md` for fuller steps and links to historical diagnostic notes.

## Developer Documentation

| Document | Contents |
|----------|---------|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System overview, technology stack, backend/frontend architecture, core algorithms (rebalancer, blend, monitor engine), auth, deployment |
| [`docs/API_REFERENCE.md`](docs/API_REFERENCE.md) | Every API endpoint — method, path, request/response shapes, query parameters |
| [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) | Every database table, column types, relationships, enums, and migration history |

## Testing

Run unit tests:
```bash
pytest tests/
```

## Project Structure

```
TAT/
├── backend/
│   ├── logic/           # Rebalancing and monitoring rollup math
│   ├── api/             # FastAPI application and routes
│   ├── database/        # SQLAlchemy engine/session (Cloud SQL connector or proxy)
│   ├── services/        # External services (e.g. Alpha Vantage)
│   └── utils/           # CSV parsers, asset classifier, PDF generation
├── frontend/            # React (Vite) application
├── cloud/               # Docker, SQL migrations, deploy scripts (bash and PowerShell)
├── docs/                # Engineering notes (e.g. monitoring performance plan)
└── tests/               # Unit and integration tests
```

## License

Proprietary - Auour Investments
