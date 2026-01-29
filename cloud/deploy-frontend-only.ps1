# Deploy frontend only - Tax-Aware Transition Tool
# Run from project root or from cloud/ folder.

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path $scriptDir
Set-Location $projectRoot

$PROJECT_ID = "tax-aware-transition-tool"
$REGION = "us-central1"
$BUCKET_NAME = "tat-frontend-$PROJECT_ID"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Deploy frontend only" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
    Write-Host "Error: gcloud CLI is not installed." -ForegroundColor Red
    exit 1
}

# Set project
gcloud config set project $PROJECT_ID | Out-Null

# Build
Write-Host "[1/2] Building frontend..." -ForegroundColor Yellow
$frontendDir = Join-Path $projectRoot "frontend"
if (-not (Test-Path $frontendDir)) {
    Write-Host "Error: frontend directory not found." -ForegroundColor Red
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

# Deploy to GCS
Write-Host "[2/2] Deploying to Cloud Storage..." -ForegroundColor Yellow
$frontendDist = Join-Path $frontendDir "dist"
if (-not (Test-Path $frontendDist)) {
    Write-Host "Error: frontend dist not found." -ForegroundColor Red
    exit 1
}

$bucketExists = gsutil ls -b "gs://$BUCKET_NAME" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Creating bucket gs://$BUCKET_NAME ..." -ForegroundColor Gray
    gsutil mb -p $PROJECT_ID -c STANDARD -l $REGION "gs://$BUCKET_NAME"
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

gsutil -m rsync -r -d $frontendDist "gs://$BUCKET_NAME"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Setting content types..." -ForegroundColor Gray
$ErrorActionPreferenceSave = $ErrorActionPreference
$ErrorActionPreference = "Continue"
gsutil -m setmeta -h "Content-Type:text/html" "gs://$BUCKET_NAME/*.html" 2>&1 | Out-Null
gsutil -m setmeta -h "Content-Type:application/javascript" "gs://$BUCKET_NAME/assets/*.js" 2>&1 | Out-Null
gsutil -m setmeta -h "Content-Type:text/css" "gs://$BUCKET_NAME/assets/*.css" 2>&1 | Out-Null
gsutil iam ch allUsers:objectViewer "gs://$BUCKET_NAME" 2>&1 | Out-Null
gsutil web set -m index.html -e index.html "gs://$BUCKET_NAME" 2>&1 | Out-Null
$ErrorActionPreference = $ErrorActionPreferenceSave

Write-Host "[OK] Frontend deployed" -ForegroundColor Green
Write-Host ""
Write-Host "Frontend URL: https://storage.googleapis.com/$BUCKET_NAME/index.html" -ForegroundColor White
Write-Host ""
