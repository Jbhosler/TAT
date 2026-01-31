# Google Cloud Deployment – Specific Steps

Use these steps from **PowerShell** (or adjust for bash). Replace `tax-aware-transition-tool` with your GCP project ID if different.

---

## Prerequisites

1. **Install Google Cloud SDK**  
   https://cloud.google.com/sdk/docs/install  
   Or: `winget install Google.CloudSDK`

2. **Log in and set project**
   ```powershell
   gcloud auth login
   gcloud config set project tax-aware-transition-tool
   ```

---

## Step 1: Enable APIs

```powershell
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable sqladmin.googleapis.com
gcloud services enable secretmanager.googleapis.com
gcloud services enable storage-api.googleapis.com
gcloud services enable storage-component.googleapis.com
gcloud services enable containerregistry.googleapis.com
```

---

## Step 2: Create Cloud SQL (first-time only)

**If the instance already exists, skip to Step 3.**

```powershell
# Create instance (5–10 min)
gcloud sql instances create tat-db-instance `
  --database-version=POSTGRES_14 `
  --tier=db-f1-micro `
  --region=us-central1 `
  --storage-type=SSD `
  --storage-size=20GB `
  --storage-auto-increase

# Create database
gcloud sql databases create tat_database --instance=tat-db-instance

# Create user (you will be prompted for password – save it)
gcloud sql users create tat_user --instance=tat-db-instance

# Get connection name (you need this for Cloud Run)
gcloud sql instances describe tat-db-instance --format="value(connectionName)"
```

Save the **connection name** (e.g. `tax-aware-transition-tool:us-central1:tat-db-instance`) and the **database password**.

---

## Step 3: Secret Manager (first-time only)

**If secrets already exist, skip to Step 4.**

Use the same DB name, user, and password from Step 2.

```powershell
$PROJECT_ID = "tax-aware-transition-tool"
$PROJECT_NUMBER = gcloud projects describe $PROJECT_ID --format="value(projectNumber)"
$SA = "$PROJECT_NUMBER-compute@developer.gserviceaccount.com"

# Create secrets (use your actual db name, user, password)
echo -n "tat_database" | gcloud secrets create db-name --data-file=- --replication-policy=automatic
echo -n "tat_user"    | gcloud secrets create db-user --data-file=- --replication-policy=automatic
# For password, create a temp file or use a secure method, then:
# gcloud secrets create db-password --data-file=path\to\password.txt --replication-policy=automatic

# If secret already exists, add a new version:
# echo -n "tat_database" | gcloud secrets versions add db-name --data-file=-

# Grant Cloud Run access
gcloud secrets add-iam-policy-binding db-name --member="serviceAccount:$SA" --role="roles/secretmanager.secretAccessor"
gcloud secrets add-iam-policy-binding db-user --member="serviceAccount:$SA" --role="roles/secretmanager.secretAccessor"
gcloud secrets add-iam-policy-binding db-password --member="serviceAccount:$SA" --role="roles/secretmanager.secretAccessor"
```

---

## Step 4: Grant Cloud Run access to Cloud SQL (first-time only)

```powershell
$PROJECT_ID = "tax-aware-transition-tool"
$PROJECT_NUMBER = gcloud projects describe $PROJECT_ID --format="value(projectNumber)"

gcloud projects add-iam-policy-binding $PROJECT_ID `
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" `
  --role="roles/cloudsql.client"
```

---

## Step 5: Database migrations

**Option A – Cloud Console (recommended on Windows)**  
1. Go to: https://console.cloud.google.com/sql/instances/tat-db-instance/databases  
2. Open **tat_database** → use Cloud Shell or the SQL workspace.  
3. Run, in order:  
   - Contents of `cloud/init-db.sql` (if DB is new).  
   - Contents of `cloud/add-monitoring-tables.sql` (for Monitoring module).  
   - Any other `cloud/add-*.sql` migrations if you haven’t run them yet.

**Option B – Cloud SQL Proxy + psql**  
1. Download Cloud SQL Proxy and run:  
   `cloud-sql-proxy tax-aware-transition-tool:us-central1:tat-db-instance`  
2. In another terminal:  
   ```powershell
   cd C:\Users\JosephHosler\TAT
   psql -h 127.0.0.1 -U postgres -d tat_database -f cloud\init-db.sql
   psql -h 127.0.0.1 -U postgres -d tat_database -f cloud\add-monitoring-tables.sql
   ```

---

## Step 6: Cloud Build – set connection name

Edit **cloud/cloudbuild.yaml** and ensure the substitution matches your instance:

```yaml
substitutions:
  _CLOUD_SQL_CONNECTION_NAME: 'tax-aware-transition-tool:us-central1:tat-db-instance'
```

Use the connection name from Step 2.

---

## Step 7: Deploy backend

From the **project root** (parent of `cloud/`):

```powershell
cd C:\Users\JosephHosler\TAT
gcloud builds submit --config cloud\cloudbuild.yaml
```

Then get the backend URL:

```powershell
gcloud run services describe tat-backend --region=us-central1 --format="value(status.url)"
```

Save this URL (e.g. `https://tat-backend-xxxxx-uc.a.run.app`).

---

## Step 8: Point frontend at backend and deploy

1. **Set API URL for production**  
   Either set when building:
   ```powershell
   $env:VITE_API_URL = "https://tat-backend-xxxxx-uc.a.run.app"   # your URL from Step 7
   ```
   Or edit `frontend/src/services/api.ts` and set the fallback URL used in production (the `import.meta.env.PROD` branch).

2. **Build and upload frontend**
   ```powershell
   cd C:\Users\JosephHosler\TAT\frontend
   npm install
   npm run build
   ```

3. **Create bucket (if needed) and upload**
   ```powershell
   $PROJECT_ID = "tax-aware-transition-tool"
   $BUCKET = "tat-frontend-$PROJECT_ID"
   $REGION = "us-central1"

   gsutil mb -p $PROJECT_ID -c STANDARD -l $REGION "gs://$BUCKET"
   gsutil -m rsync -r -d .\dist "gs://$BUCKET"
   gsutil -m setmeta -h "Content-Type:text/html" "gs://$BUCKET/*.html"
   gsutil -m setmeta -h "Content-Type:application/javascript" "gs://$BUCKET/assets/*.js"
   gsutil -m setmeta -h "Content-Type:text/css" "gs://$BUCKET/assets/*.css"
   gsutil iam ch allUsers:objectViewer "gs://$BUCKET"
   gsutil web set -m index.html -e index.html "gs://$BUCKET"
   ```

4. **Frontend URL**  
   `https://storage.googleapis.com/tat-frontend-tax-aware-transition-tool/index.html`

---

## Step 9: Verify

1. Open the frontend URL; passcode is `007`.  
2. Try: create strategy, upload prospect CSV, run transition.  
3. Try: **Monitoring** → Strategy Bridge, upload aggregated CSV, view Heat Map.

---

## Quick redeploy (after first setup)

- **Backend only:**  
  `gcloud builds submit --config cloud\cloudbuild.yaml`  
  (from project root)

- **Frontend only:**  
  Build in `frontend/`, then run the `gsutil rsync` and `setmeta` commands from Step 8.3.

- **New DB migrations:**  
  Run the new `cloud/add-*.sql` file(s) in Cloud Console or via Proxy + psql (Step 5).

---

## One-command flow (interactive)

From project root:

```powershell
.\cloud\deploy-all.ps1
```

Answer the prompts for database creation, secrets, migrations, backend deploy, and frontend deploy. For migrations, if the script only runs `init-db.sql`, run **add-monitoring-tables.sql** (and any other add-*.sql) manually as in Step 5.
