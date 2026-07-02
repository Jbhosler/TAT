# Deploy Backend and Frontend - Tax-Aware Transition Tool
# Run from project root or from cloud/ folder. No prompts; deploys both.

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path $scriptDir
Set-Location $projectRoot

$PROJECT_ID = "tax-aware-transition-tool"
$REGION = "us-central1"
$BUCKET_NAME = "tat-frontend-$PROJECT_ID"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Deploy Backend + Frontend" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Project: $PROJECT_ID" -ForegroundColor Gray
Write-Host "Working directory: $projectRoot" -ForegroundColor Gray
Write-Host ""

if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
    Write-Host "Error: gcloud CLI is not installed." -ForegroundColor Red
    exit 1
}

# Set project
Write-Host "[1/4] Setting GCP project..." -ForegroundColor Yellow
gcloud config set project $PROJECT_ID
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "[OK]" -ForegroundColor Green
Write-Host ""

# Deploy Backend (Cloud Build -> Cloud Run)
Write-Host "[2/4] Deploying backend (Cloud Build -> Cloud Run)..." -ForegroundColor Yellow
$cloudbuildPath = Join-Path $projectRoot "cloud\cloudbuild.yaml"
if (-not (Test-Path $cloudbuildPath)) {
    Write-Host "Error: cloudbuild.yaml not found at $cloudbuildPath" -ForegroundColor Red
    exit 1
}
gcloud builds submit --config $cloudbuildPath
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "[OK] Backend deployed" -ForegroundColor Green
Write-Host ""

# Build Frontend
Write-Host "[3/4] Building frontend..." -ForegroundColor Yellow
$frontendDir = Join-Path $projectRoot "frontend"
if (-not (Test-Path $frontendDir)) {
    Write-Host "Error: frontend directory not found at $frontendDir" -ForegroundColor Red
    exit 1
}
Push-Location $frontendDir
npm install
if ($LASTEXITCODE -ne 0) { Pop-Location; exit $LASTEXITCODE }
npm run build
if ($LASTEXITCODE -ne 0) { Pop-Location; exit $LASTEXITCODE }
Pop-Location
Write-Host "[OK] Frontend built" -ForegroundColor Green
Write-Host ""

# Deploy Frontend (upload to GCS)
Write-Host "[4/4] Deploying frontend to Cloud Storage..." -ForegroundColor Yellow
$frontendDist = Join-Path $frontendDir "dist"
if (-not (Test-Path $frontendDist)) {
    Write-Host "Error: frontend dist not found at $frontendDist" -ForegroundColor Red
    exit 1
}

& (Join-Path $scriptDir "sync-frontend-to-gcs.ps1") -DistDir $frontendDist
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "[OK] Frontend deployed to tat-frontend + tat.auourinvest.com buckets" -ForegroundColor Green
Write-Host ""

# Output URLs
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Deployment complete" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
$backendUrl = gcloud run services describe tat-backend --region=$REGION --format="value(status.url)" 2>&1
if ($backendUrl -and -not $backendUrl.Contains("ERROR")) {
    Write-Host "Backend:  $backendUrl" -ForegroundColor White
}
Write-Host "Frontend (storage URL): https://storage.googleapis.com/$BUCKET_NAME/index.html" -ForegroundColor White
Write-Host "Frontend (custom domain): https://tat.auourinvest.com/" -ForegroundColor White
Write-Host ""
