# Quick Start - Google Cloud Deployment

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

### 5. Update Frontend API URL
Edit `frontend/src/services/api.ts`:
```typescript
const API_BASE_URL = 'https://tat-backend-XXXXX.a.run.app';
```

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
