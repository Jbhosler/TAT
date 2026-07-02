# Deploy portal static app to Cloud Storage bucket auour-portal-tax-aware-transition-tool
# Run from repo root.

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path $scriptDir
Set-Location $projectRoot

$PROJECT_ID = "tax-aware-transition-tool"
$REGION = "us-central1"
$BUCKET_NAME = "auour-portal-$PROJECT_ID"

Write-Host "Deploy portal ($BUCKET_NAME)" -ForegroundColor Cyan

if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
    Write-Host "gcloud not installed." -ForegroundColor Red
    exit 1
}

gcloud config set project $PROJECT_ID | Out-Null

Push-Location (Join-Path $projectRoot "portal")
npm install
if ($LASTEXITCODE -ne 0) { Pop-Location; exit $LASTEXITCODE }
npm run build
if ($LASTEXITCODE -ne 0) { Pop-Location; exit $LASTEXITCODE }
Pop-Location

$dist = Join-Path $projectRoot "portal\dist"
if (-not (Test-Path $dist)) {
    Write-Host "portal/dist missing." -ForegroundColor Red
    exit 1
}

gsutil ls -b "gs://$BUCKET_NAME" 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    gsutil mb -p $PROJECT_ID -c STANDARD -l $REGION "gs://$BUCKET_NAME"
}

gsutil -m rsync -r -d $dist "gs://$BUCKET_NAME"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$save = $ErrorActionPreference
$ErrorActionPreference = "Continue"
gsutil -m setmeta -h "Content-Type:text/html" -h "Cache-Control:no-cache, no-store, must-revalidate" "gs://$BUCKET_NAME/index.html" 2>&1 | Out-Null
gsutil -m setmeta -h "Content-Type:application/javascript" "gs://$BUCKET_NAME/assets/*.js" 2>&1 | Out-Null
gsutil -m setmeta -h "Content-Type:text/css" "gs://$BUCKET_NAME/assets/*.css" 2>&1 | Out-Null
gsutil iam ch allUsers:objectViewer "gs://$BUCKET_NAME" 2>&1 | Out-Null
gsutil web set -m index.html -e index.html "gs://$BUCKET_NAME" 2>&1 | Out-Null
$ErrorActionPreference = $save

Write-Host "Portal: https://storage.googleapis.com/$BUCKET_NAME/index.html" -ForegroundColor Green
