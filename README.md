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

### Prospect Transition Engine
- **Automatic Classification**: Identifies individual stocks (side-pocket) vs funds
- **Option C Mapping**: Manual mapping wizard for unmapped tickers
- **Multi-Asset Splits**: Support for funds that map to multiple Model Tickers
- **Tax-Aware Rebalancing**: 
  - Grade hierarchy: Grade 2 → Grade 1 → Grade 0
  - Sell to Upper Drift Limit (not midpoint)
  - Greedy elimination: Prefer 100% liquidation when possible
  - 0.1% precision for all calculations

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

3. Configure environment:
```bash
cp .env.example .env.local
# Edit .env.local with your database credentials
```

4. Run database migrations (when Alembic is configured):
```bash
alembic upgrade head
```

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

## Testing

Run unit tests:
```bash
pytest tests/
```

## Project Structure

```
TAT/
├── backend/
│   ├── logic/           # Pure rebalancing math
│   ├── api/             # FastAPI application
│   ├── database/        # Database connection and migrations
│   └── utils/            # CSV parsers, asset classifier
├── frontend/            # React application
├── cloud/               # Deployment configurations
└── tests/                # Unit and integration tests
```

## License

Proprietary - Auour Investments
