# Google Cloud Deployment Guide

Complete guide to deploy the Tax-Aware Transition Tool to Google Cloud.

## Quick Start

Run the master deployment script:

```bash
chmod +x cloud/deploy-all.sh
./cloud/deploy-all.sh
```

This will guide you through all deployment steps interactively.

## Manual Deployment Steps

### Prerequisites

1. **Install Google Cloud SDK**
   ```bash
   # macOS
   brew install google-cloud-sdk
   
   # Or download from: https://cloud.google.com/sdk/docs/install
   ```

2. **Authenticate**
   ```bash
   gcloud auth login
   gcloud config set project tax-aware-transition-tool
   ```

### Step 1: Enable Required APIs

```bash
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable sqladmin.googleapis.com
gcloud services enable secretmanager.googleapis.com
gcloud services enable storage-api.googleapis.com
gcloud services enable storage-component.googleapis.com
gcloud services enable containerregistry.googleapis.com
```

### Step 2: Create Cloud SQL Database

```bash
cd cloud
chmod +x setup-database.sh
./setup-database.sh
```

This creates:
- PostgreSQL 14 instance: `tat-db-instance`
- Database: `tat_database`
- User: `tat_user`

**Save the connection name and password!**

### Step 3: Run Database Migrations

```bash
chmod +x run-migrations.sh
./run-migrations.sh
```

Or manually:
```bash
gcloud sql connect tat-db-instance --user=postgres --database=tat_database < init-db.sql
```

### Step 4: Setup Secret Manager

```bash
chmod +x setup-secrets.sh
./setup-secrets.sh
```

Enter:
- Database name: `tat_database`
- Database user: `tat_user`
- Database password: (the one you created in Step 2)

### Step 5: Update Cloud Build Configuration

Edit `cloud/cloudbuild.yaml` and update the connection name:

```yaml
substitutions:
  _CLOUD_SQL_CONNECTION_NAME: 'tax-aware-transition-tool:us-central1:tat-db-instance'
```

Replace with your actual connection name from Step 2.

### Step 6: Deploy Backend

```bash
chmod +x deploy.sh
./deploy.sh
```

This will:
1. Build Docker image
2. Push to Container Registry
3. Deploy to Cloud Run
4. Configure Cloud SQL connection
5. Set environment variables

**Note the backend URL from the output!**

### Step 7: Update Frontend API URL

Edit `frontend/src/services/api.ts`:

```typescript
const API_BASE_URL = import.meta.env.VITE_API_URL || 
  'https://tat-backend-XXXXX.a.run.app';  // Replace with your backend URL
```

### Step 8: Deploy Frontend

```bash
chmod +x deploy-frontend.sh
./deploy-frontend.sh
```

This will:
1. Build React app
2. Upload to Cloud Storage
3. Configure public access

## Post-Deployment

### Get Service URLs

**Backend URL:**
```bash
gcloud run services describe tat-backend --region=us-central1 --format="value(status.url)"
```

**Frontend URL:**
```
https://storage.googleapis.com/tat-frontend-tax-aware-transition-tool/index.html
```

### Grant Cloud Run Access to Cloud SQL

The deployment script should handle this, but if you need to do it manually:

```bash
PROJECT_NUMBER=$(gcloud projects describe tax-aware-transition-tool --format="value(projectNumber)")
gcloud projects add-iam-policy-binding tax-aware-transition-tool \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/cloudsql.client"
```

### Test the Deployment

1. Visit the frontend URL
2. Enter passcode: `007`
3. Try creating a strategy
4. Upload a prospect CSV
5. Run a transition calculation

## Troubleshooting

### Backend can't connect to database

1. Check Cloud SQL instance is running:
   ```bash
   gcloud sql instances describe tat-db-instance
   ```

2. Verify Cloud Run service account has Cloud SQL Client role:
   ```bash
   PROJECT_NUMBER=$(gcloud projects describe tax-aware-transition-tool --format="value(projectNumber)")
   gcloud projects get-iam-policy tax-aware-transition-tool \
     --flatten="bindings[].members" \
     --filter="bindings.members:serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
   ```

3. Check Cloud Run logs:
   ```bash
   gcloud run services logs read tat-backend --region=us-central1
   ```

### Frontend can't reach backend

1. Update `API_BASE_URL` in `frontend/src/services/api.ts`
2. Rebuild and redeploy frontend
3. Check CORS settings in backend (should allow all origins for now)

### Build failures

1. Check Cloud Build logs:
   ```bash
   gcloud builds list --limit=5
   gcloud builds log <BUILD_ID>
   ```

2. Test Docker build locally:
   ```bash
   docker build -f cloud/Dockerfile -t tat-backend:test .
   ```

### Database connection errors

1. Verify connection name format: `project:region:instance`
2. Check Secret Manager secrets exist:
   ```bash
   gcloud secrets list
   ```
3. Verify secrets are accessible:
   ```bash
   gcloud secrets versions access latest --secret="db-name"
   ```

## Cost Optimization

- **Cloud SQL**: Use `db-f1-micro` for development (free tier eligible)
- **Cloud Run**: Set min instances to 0 to only pay for requests
- **Cloud Storage**: Use lifecycle policies to delete old frontend versions
- **Monitoring**: Set up billing alerts in Google Cloud Console

## Security Best Practices

1. **Use Private IP for Cloud SQL** (already configured)
2. **Rotate secrets regularly**
3. **Enable Cloud Armor** for DDoS protection
4. **Use IAM conditions** to restrict access
5. **Enable audit logs** for compliance

## Updating the Application

### Update Backend

```bash
cd cloud
./deploy.sh
```

### Update Frontend

```bash
cd cloud
./deploy-frontend.sh
```

### Update Database Schema

1. Update `cloud/init-db.sql`
2. Run migrations:
   ```bash
   ./run-migrations.sh
   ```

## Support

For issues or questions:
1. Check Cloud Run logs
2. Check Cloud Build logs
3. Review Google Cloud documentation
4. Check application logs in Cloud Logging
