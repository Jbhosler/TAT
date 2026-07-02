# Google Cloud Deployment Guide

This guide will help you deploy the Tax-Aware Transition Tool to Google Cloud.

**Looking for older diagnostic or one-off fix notes?** See [TROUBLESHOOTING-INDEX.md](TROUBLESHOOTING-INDEX.md) for a map of this folder (canonical guides vs historical incident docs).

## Prerequisites

1. Google Cloud SDK installed and configured
2. Authenticated with `gcloud auth login`
3. Project `tax-aware-transition-tool` created in Google Cloud

## Deployment Steps

### 1. Set Up Cloud SQL Database

```bash
chmod +x cloud/setup-database.sh
./cloud/setup-database.sh
```

This will:
- Create a PostgreSQL 14 Cloud SQL instance
- Create the database `tat_database`
- Create a database user `tat_user`
- Display the connection name

**Note:** Save the database password you enter - you'll need it for the next step.

### 2. Set Up Secret Manager

```bash
chmod +x cloud/setup-secrets.sh
./cloud/setup-secrets.sh
```

This will:
- Create secrets in Secret Manager for:
  - `db-name`: Database name
  - `db-user`: Database user
  - `db-password`: Database password
- Grant Cloud Run service account access to the secrets

### 3. Update Cloud Build Configuration

Edit `cloud/cloudbuild.yaml` and update the `_CLOUD_SQL_CONNECTION_NAME` substitution with your actual connection name from step 1.

The connection name format is: `project:region:instance`

### 4. Deploy Backend to Cloud Run

```bash
chmod +x cloud/deploy.sh
./cloud/deploy.sh
```

This will:
- Enable required Google Cloud APIs
- Build the Docker image
- Push to Container Registry
- Deploy to Cloud Run
- Configure Cloud SQL connection
- Set up environment variables and secrets

### 5. Run Database Migrations

After the backend is deployed, apply schema SQL:

1. **New database:** Run `cloud/init-db.sql` (or `init-db-safe.sql` for a clean reinstall).
2. **Existing database:** Run any incremental `cloud/add-*.sql` files you have not applied yet.

Use Cloud Shell and `psql` via `gcloud sql connect`, or the scripts in `cloud/` (see `DB-MIGRATION-CLOUD-SHELL.md`). There is no Alembic migration chain checked into this repo; the API also runs SQLAlchemy `create_all` on startup for ORM tables, but enums and one-off columns still require the SQL files where applicable.

### 6. Deploy Frontend

```bash
chmod +x cloud/deploy-frontend.sh
./cloud/deploy-frontend.sh
```

This will:
- Build the React frontend
- Upload to Cloud Storage
- Configure public access
- Set up website hosting

### 7. Deploy Auour Portal (optional hub app)

From the repo root on Windows (PowerShell):

```powershell
./cloud/deploy-portal-only.ps1
```

Deploys `portal/` to bucket `gs://auour-portal-tax-aware-transition-tool` and prints the public URL.

## Environment Variables

The backend will use these environment variables (set via Cloud Run):

- `GCP_PROJECT_ID`: tax-aware-transition-tool
- `GCP_REGION`: us-central1
- `ENVIRONMENT`: production
- `DB_HOST`: tax-aware-transition-tool:us-central1:tat-db-instance
- `USE_CLOUD_SQL_PROXY`: false
- `DB_NAME`, `DB_USER`, `DB_PASSWORD`: From Secret Manager

## Updating the Frontend API URL

Set `VITE_API_URL` to your Cloud Run URL when building the frontend (`export VITE_API_URL=...` then `npm run build` in `frontend/`), or adjust the production fallback in `frontend/src/services/api.ts`. Rebuild and redeploy the static assets afterward.

## Troubleshooting

### Backend not connecting to database
- Verify Cloud SQL instance is running
- Check that Cloud Run service account has Cloud SQL Client role
- Verify connection name in Cloud Run service configuration
- Check Secret Manager secrets are accessible

### Frontend can't reach backend
- Update API_BASE_URL in frontend code
- Check CORS settings in backend
- Verify Cloud Run service allows unauthenticated access (if needed)

### Build failures
- Check that all required APIs are enabled
- Verify Docker build works locally
- Check Cloud Build logs in Google Cloud Console

## Cost Optimization

- Use `db-f1-micro` for development (free tier eligible)
- Set Cloud Run min instances to 0 for cost savings
- Use Cloud Storage lifecycle policies for old frontend versions
- Monitor Cloud SQL usage and adjust tier as needed

## Security Notes

- Secrets are stored in Secret Manager (encrypted at rest)
- Cloud SQL uses private IP (recommended for production)
- Cloud Run service uses least-privilege IAM
- Frontend is served over HTTPS via Cloud Storage
