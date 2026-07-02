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

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
& (Join-Path $scriptDir "sync-frontend-to-gcs.ps1") -DistDir $frontendDist
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "[OK] Frontend deployed" -ForegroundColor Green
Write-Host ""
Write-Host "Frontend (storage URL): https://storage.googleapis.com/$BUCKET_NAME/index.html" -ForegroundColor White
Write-Host "Frontend (custom domain): https://tat.auourinvest.com/" -ForegroundColor White
Write-Host ""
