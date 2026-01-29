# PowerShell deployment script for Windows
# Tax-Aware Transition Tool - Cloud Deployment

$ErrorActionPreference = "Stop"

# Change to project root directory (parent of cloud/)
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path $scriptDir
Set-Location $projectRoot
Write-Host "Working directory: $projectRoot" -ForegroundColor Gray

$PROJECT_ID = "tax-aware-transition-tool"
$REGION = "us-central1"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Tax-Aware Transition Tool - Cloud Deployment" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Check if gcloud is installed
if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
    Write-Host "Error: gcloud CLI is not installed. Please install it first." -ForegroundColor Red
    exit 1
}

# Set project
Write-Host "Setting GCP project to $PROJECT_ID..." -ForegroundColor Yellow
gcloud config set project $PROJECT_ID

# Step 1: Enable APIs
Write-Host ""
Write-Host "Step 1: Enabling required Google Cloud APIs..." -ForegroundColor Yellow
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable sqladmin.googleapis.com
gcloud services enable secretmanager.googleapis.com
gcloud services enable storage-api.googleapis.com
gcloud services enable storage-component.googleapis.com
gcloud services enable containerregistry.googleapis.com
Write-Host "[OK] APIs enabled" -ForegroundColor Green

# Step 2: Setup Cloud SQL
Write-Host ""
Write-Host "Step 2: Setting up Cloud SQL database..." -ForegroundColor Yellow
Write-Host "This will create a PostgreSQL instance (may take 5-10 minutes)..." -ForegroundColor Yellow
$response = Read-Host "Continue? (y/n)"
if ($response -eq "y" -or $response -eq "Y") {
    Write-Host "Creating Cloud SQL instance..." -ForegroundColor Yellow
    $ErrorActionPreference = "Continue"
    gcloud sql instances create tat-db-instance --database-version=POSTGRES_14 --tier=db-f1-micro --region=$REGION --storage-type=SSD --storage-size=20GB --storage-auto-increase --backup-start-time=03:00 --maintenance-window-day=SUN --maintenance-window-hour=04 2>&1 | Out-Null
    
    Write-Host "Waiting for instance to be ready..." -ForegroundColor Yellow
    Start-Sleep -Seconds 30
    
    Write-Host "Creating database..." -ForegroundColor Yellow
    gcloud sql databases create tat_database --instance=tat-db-instance 2>&1 | Out-Null
    
    Write-Host "Creating database user..." -ForegroundColor Yellow
    $securePassword = Read-Host "Please enter a password for the database user" -AsSecureString
    $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
    $plainPassword = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
    
    gcloud sql users create tat_user --instance=tat-db-instance --password=$plainPassword 2>&1 | Out-Null
    
    $CONNECTION_NAME = gcloud sql instances describe tat-db-instance --format="value(connectionName)"
    Write-Host "[OK] Database setup complete" -ForegroundColor Green
    Write-Host "Connection name: $CONNECTION_NAME" -ForegroundColor Cyan
    Write-Host "Please save the database password!" -ForegroundColor Yellow
    $ErrorActionPreference = "Stop"
}
else {
    Write-Host "Skipping database setup." -ForegroundColor Yellow
}

# Step 3: Setup Secrets
Write-Host ""
Write-Host "Step 3: Setting up Secret Manager..." -ForegroundColor Yellow
$response = Read-Host "Continue? (y/n)"
if ($response -eq "y" -or $response -eq "Y") {
    Write-Host "Please enter the database name:" -ForegroundColor Yellow
    $DB_NAME = Read-Host
    Write-Host "Please enter the database user:" -ForegroundColor Yellow
    $DB_USER = Read-Host
    Write-Host "Please enter the database password:" -ForegroundColor Yellow
    $securePassword = Read-Host -AsSecureString
    $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
    $DB_PASSWORD = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
    
    # Create or update secrets
    $ErrorActionPreference = "Continue"
    
    # Create db-name secret (using UTF-8 encoding)
    $tempFile = [System.IO.Path]::GetTempFileName()
    [System.IO.File]::WriteAllText($tempFile, $DB_NAME, [System.Text.Encoding]::UTF8)
    $result = gcloud secrets create db-name --data-file=$tempFile --replication-policy="automatic" 2>&1
    if ($LASTEXITCODE -ne 0) {
        gcloud secrets versions add db-name --data-file=$tempFile 2>&1 | Out-Null
    }
    Remove-Item $tempFile
    
    # Create db-user secret (using UTF-8 encoding)
    $tempFile = [System.IO.Path]::GetTempFileName()
    [System.IO.File]::WriteAllText($tempFile, $DB_USER, [System.Text.Encoding]::UTF8)
    $result = gcloud secrets create db-user --data-file=$tempFile --replication-policy="automatic" 2>&1
    if ($LASTEXITCODE -ne 0) {
        gcloud secrets versions add db-user --data-file=$tempFile 2>&1 | Out-Null
    }
    Remove-Item $tempFile
    
    # Create db-password secret (using UTF-8 encoding)
    $tempFile = [System.IO.Path]::GetTempFileName()
    [System.IO.File]::WriteAllText($tempFile, $DB_PASSWORD, [System.Text.Encoding]::UTF8)
    $result = gcloud secrets create db-password --data-file=$tempFile --replication-policy="automatic" 2>&1
    if ($LASTEXITCODE -ne 0) {
        gcloud secrets versions add db-password --data-file=$tempFile 2>&1 | Out-Null
    }
    Remove-Item $tempFile
    
    $ErrorActionPreference = "Stop"
    
    # Grant access to Cloud Run service account
    $PROJECT_NUMBER = gcloud projects describe $PROJECT_ID --format="value(projectNumber)"
    $SERVICE_ACCOUNT = "$PROJECT_NUMBER-compute@developer.gserviceaccount.com"
    
    gcloud secrets add-iam-policy-binding db-name --member="serviceAccount:$SERVICE_ACCOUNT" --role="roles/secretmanager.secretAccessor"
    gcloud secrets add-iam-policy-binding db-user --member="serviceAccount:$SERVICE_ACCOUNT" --role="roles/secretmanager.secretAccessor"
    gcloud secrets add-iam-policy-binding db-password --member="serviceAccount:$SERVICE_ACCOUNT" --role="roles/secretmanager.secretAccessor"
    
    Write-Host "[OK] Secrets setup complete" -ForegroundColor Green
}
else {
    Write-Host "Skipping secrets setup." -ForegroundColor Yellow
}

# Step 4: Run migrations
Write-Host ""
Write-Host "Step 4: Running database migrations..." -ForegroundColor Yellow
$response = Read-Host "Continue? (y/n)"
if ($response -eq "y" -or $response -eq "Y") {
    $initDbPath = Join-Path $projectRoot "cloud\init-db.sql"
    if (-not (Test-Path $initDbPath)) {
        Write-Host "Error: Cannot find init-db.sql at $initDbPath" -ForegroundColor Red
        Write-Host "Skipping migrations." -ForegroundColor Yellow
    } else {
        Write-Host "Running migrations from: $initDbPath" -ForegroundColor Yellow
        Write-Host "Note: Using Cloud SQL Proxy for connection..." -ForegroundColor Gray
        $migrationResult = Get-Content $initDbPath | gcloud beta sql connect tat-db-instance --user=postgres --database=tat_database 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "[OK] Migrations complete" -ForegroundColor Green
        } else {
            Write-Host "Warning: Migration may have failed. Error code: $LASTEXITCODE" -ForegroundColor Yellow
            Write-Host "You may need to run migrations manually using Cloud SQL Proxy" -ForegroundColor Yellow
            Write-Host "Alternative: Use psql with Cloud SQL Proxy or run SQL directly in Cloud Console" -ForegroundColor Yellow
        }
    }
}
else {
    Write-Host "Skipping migrations." -ForegroundColor Yellow
}

# Step 5: Deploy Backend
Write-Host ""
Write-Host "Step 5: Deploying backend to Cloud Run..." -ForegroundColor Yellow
$response = Read-Host "Continue? (y/n)"
if ($response -eq "y" -or $response -eq "Y") {
    Write-Host "Building and deploying backend..." -ForegroundColor Yellow
    $cloudbuildPath = Join-Path $projectRoot "cloud\cloudbuild.yaml"
    if (-not (Test-Path $cloudbuildPath)) {
        Write-Host "Error: Cannot find cloudbuild.yaml at $cloudbuildPath" -ForegroundColor Red
        Write-Host "Skipping backend deployment." -ForegroundColor Yellow
    } else {
        gcloud builds submit --config $cloudbuildPath
        Write-Host "[OK] Backend deployed" -ForegroundColor Green
        
        # Get backend URL
        $backendUrl = gcloud run services describe tat-backend --region=$REGION --format="value(status.url)" 2>&1
        if ($backendUrl -and -not $backendUrl.Contains("ERROR")) {
            Write-Host "Backend URL: $backendUrl" -ForegroundColor Cyan
        }
    }
}
else {
    Write-Host "Skipping backend deployment." -ForegroundColor Yellow
}

# Step 6: Deploy Frontend
Write-Host ""
Write-Host "Step 6: Deploying frontend to Cloud Storage..." -ForegroundColor Yellow
$response = Read-Host "Continue? (y/n)"
if ($response -eq "y" -or $response -eq "Y") {
    Write-Host "Building frontend..." -ForegroundColor Yellow
    $frontendDir = Join-Path $projectRoot "frontend"
    if (-not (Test-Path $frontendDir)) {
        Write-Host "Error: Cannot find frontend directory at $frontendDir" -ForegroundColor Red
        Write-Host "Skipping frontend deployment." -ForegroundColor Yellow
    } else {
        Set-Location $frontendDir
        npm install
        npm run build
        Set-Location $projectRoot
        
        Write-Host "Creating Cloud Storage bucket..." -ForegroundColor Yellow
        $BUCKET_NAME = "tat-frontend-$PROJECT_ID"
        # Check if bucket exists, create if not
        $bucketExists = gsutil ls -b "gs://$BUCKET_NAME" 2>&1
        if ($LASTEXITCODE -ne 0) {
            gsutil mb -p $PROJECT_ID -c STANDARD -l $REGION "gs://$BUCKET_NAME" 2>&1 | Out-Null
            if ($LASTEXITCODE -eq 0) {
                Write-Host "[OK] Bucket created: gs://$BUCKET_NAME" -ForegroundColor Green
            } else {
                Write-Host "[WARN] Bucket creation returned non-zero exit code, but may have succeeded" -ForegroundColor Yellow
            }
        } else {
            Write-Host "[OK] Bucket already exists: gs://$BUCKET_NAME" -ForegroundColor Green
        }
        
        Write-Host "Uploading frontend..." -ForegroundColor Yellow
        $frontendDist = Join-Path $frontendDir "dist"
        if (-not (Test-Path $frontendDist)) {
            Write-Host "Error: Frontend dist directory not found. Build may have failed." -ForegroundColor Red
        } else {
            # Upload with correct content types
            gsutil -m rsync -r -h "Content-Type:text/html" $frontendDist "gs://$BUCKET_NAME"
            
            # Set correct content types for different file types
            Write-Host "Setting content types..." -ForegroundColor Yellow
            gsutil -m setmeta -h "Content-Type:text/html" "gs://$BUCKET_NAME/*.html"
            gsutil -m setmeta -h "Content-Type:application/javascript" "gs://$BUCKET_NAME/assets/*.js"
            gsutil -m setmeta -h "Content-Type:text/css" "gs://$BUCKET_NAME/assets/*.css"
            gsutil -m setmeta -h "Content-Type:image/svg+xml" "gs://$BUCKET_NAME/*.svg"
            
            Write-Host "Setting bucket permissions..." -ForegroundColor Yellow
            gsutil iam ch allUsers:objectViewer "gs://$BUCKET_NAME"
            gsutil web set -m index.html -e index.html "gs://$BUCKET_NAME"
            
            Write-Host "[OK] Frontend deployed" -ForegroundColor Green
            Write-Host "Frontend URL: https://storage.googleapis.com/$BUCKET_NAME/index.html" -ForegroundColor Cyan
        }
    }
}
else {
    Write-Host "Skipping frontend deployment." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Deployment Complete!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Get your backend URL: gcloud run services describe tat-backend --region=us-central1 --format=`"value(status.url)`"" -ForegroundColor White
Write-Host "2. Update frontend/src/services/api.ts with the backend URL" -ForegroundColor White
Write-Host "3. Rebuild and redeploy frontend" -ForegroundColor White
Write-Host "4. Test the application" -ForegroundColor White
Write-Host ""
