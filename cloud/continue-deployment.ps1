# Continue deployment from Step 4 onwards
# Run this if you've already completed Steps 1-3

$ErrorActionPreference = "Stop"
$PROJECT_ID = "tax-aware-transition-tool"
$REGION = "us-central1"

Write-Host "Continuing deployment from Step 4..." -ForegroundColor Cyan
Write-Host ""

# Step 4: Run migrations
Write-Host "Step 4: Running database migrations..." -ForegroundColor Yellow
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$initDbPath = Join-Path $scriptDir "init-db.sql"
if (-not (Test-Path $initDbPath)) {
    Write-Host "Error: Cannot find init-db.sql at $initDbPath" -ForegroundColor Red
    exit 1
}
Write-Host "Running migrations from: $initDbPath" -ForegroundColor Yellow
Get-Content $initDbPath | gcloud sql connect tat-db-instance --user=postgres --database=tat_database
Write-Host "[OK] Migrations complete" -ForegroundColor Green

# Step 5: Deploy Backend
Write-Host ""
Write-Host "Step 5: Deploying backend to Cloud Run..." -ForegroundColor Yellow
$response = Read-Host "Continue? (y/n)"
if ($response -eq "y" -or $response -eq "Y") {
    Write-Host "Building and deploying backend..." -ForegroundColor Yellow
    # Change to project root for gcloud builds submit
    $projectRoot = Split-Path $scriptDir
    Set-Location $projectRoot
    gcloud builds submit --config cloud/cloudbuild.yaml
    Write-Host "[OK] Backend deployed" -ForegroundColor Green
    
    # Get backend URL
    $backendUrl = gcloud run services describe tat-backend --region=$REGION --format="value(status.url)"
    Write-Host "Backend URL: $backendUrl" -ForegroundColor Cyan
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
    Set-Location frontend
    npm install
    npm run build
    Set-Location $projectRoot
    
    Write-Host "Creating Cloud Storage bucket..." -ForegroundColor Yellow
    $BUCKET_NAME = "tat-frontend-$PROJECT_ID"
    gsutil mb -p $PROJECT_ID -c STANDARD -l $REGION "gs://$BUCKET_NAME/" 2>&1 | Out-Null
    
    Write-Host "Uploading frontend..." -ForegroundColor Yellow
    gsutil -m rsync -r frontend/dist "gs://$BUCKET_NAME"
    
    Write-Host "Setting bucket permissions..." -ForegroundColor Yellow
    gsutil iam ch allUsers:objectViewer "gs://$BUCKET_NAME"
    gsutil web set -m index.html -e index.html "gs://$BUCKET_NAME"
    
    Write-Host "[OK] Frontend deployed" -ForegroundColor Green
    Write-Host "Frontend URL: https://storage.googleapis.com/$BUCKET_NAME/index.html" -ForegroundColor Cyan
}
else {
    Write-Host "Skipping frontend deployment." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Deployment Complete!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
