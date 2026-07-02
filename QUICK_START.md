# Quick Start - Google Cloud Deployment

**Windows:** Prefer WSL/Git Bash for the bash flow below, or see `cloud/DEPLOY_WINDOWS.md`. There is also `cloud/deploy-all.ps1` for a PowerShell-oriented path.

## One-Command Deployment

```bash
cd cloud
chmod +x deploy-all.sh
./deploy-all.sh
```

This interactive script will guide you through:
1. ✅ Enabling APIs
2. ✅ Creating Cloud SQL database
3. ✅ Setting up Secret Manager
4. ✅ Running database migrations
5. ✅ Deploying backend to Cloud Run
6. ✅ Deploying frontend to Cloud Storage

## Manual Step-by-Step

### 1. Setup Database
```bash
cd cloud
chmod +x setup-database.sh
./setup-database.sh
# Save the connection name and password!
```

### 2. Setup Secrets
```bash
chmod +x setup-secrets.sh
./setup-secrets.sh
# Enter: db-name, db-user, db-password
```

### 3. Run Migrations
```bash
chmod +x run-migrations.sh
./run-migrations.sh
```

### 4. Deploy Backend
```bash
chmod +x deploy.sh
./deploy.sh
# Note the backend URL from output
```

### 5. Point the frontend at the backend

`frontend/src/services/api.ts` uses `import.meta.env.VITE_API_URL` when set; in production it falls back to a default Cloud Run URL if the variable is missing.

**Recommended:** set the URL at build time (no source edit):

```bash
cd frontend
export VITE_API_URL=https://YOUR-BACKEND-URL.a.run.app
npm run build
```

Windows PowerShell:

```powershell
cd frontend
$env:VITE_API_URL="https://YOUR-BACKEND-URL.a.run.app"
npm run build
```

Then deploy the `dist/` output with `cloud/deploy-frontend.sh` (or your usual upload step).

**Alternative:** change the production fallback in `api.ts` only if you intentionally commit a stable backend URL.

### 6. Deploy Frontend
```bash
chmod +x deploy-frontend.sh
./deploy-frontend.sh
```

## Get Your URLs

**Backend:**
```bash
gcloud run services describe tat-backend --region=us-central1 --format="value(status.url)"
```

**Frontend:**
```
https://storage.googleapis.com/tat-frontend-tax-aware-transition-tool/index.html
```

## Test

1. Visit frontend URL
2. Enter passcode: `007`
3. Create a strategy
4. Upload a prospect
5. Calculate transition

## Troubleshooting

**Check logs:**
```bash
gcloud run services logs read tat-backend --region=us-central1
```

**Check database:**
```bash
gcloud sql instances describe tat-db-instance
```

**Check secrets:**
```bash
gcloud secrets list
```

## Important Notes

- Cloud SQL instance creation takes 5-10 minutes
- Save database password - you'll need it for secrets
- Update frontend API URL after backend deployment
- All scripts must be run from the `cloud/` directory
