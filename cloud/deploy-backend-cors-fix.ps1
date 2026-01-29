# Deploy Backend with CORS Fix
$PROJECT_ID = "tax-aware-transition-tool"
$PROJECT_ROOT = Split-Path -Parent $PSScriptRoot

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Deploy Backend with CORS Fix" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Step 1: Submitting build to Cloud Build..." -ForegroundColor Yellow
Set-Location $PROJECT_ROOT
gcloud builds submit --config cloud/cloudbuild.yaml

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "[OK] Backend deployed successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Backend URL:" -ForegroundColor Cyan
    $backendUrl = gcloud run services describe tat-backend --region=us-central1 --format="value(status.url)" 2>&1
    if ($backendUrl) {
        Write-Host "  $backendUrl" -ForegroundColor White
    }
    Write-Host ""
    Write-Host "CORS is now configured to allow requests from:" -ForegroundColor Gray
    Write-Host "  - https://storage.googleapis.com" -ForegroundColor Gray
    Write-Host "  - http://localhost:3000 (local dev)" -ForegroundColor Gray
    Write-Host "  - * (all other origins)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Test the frontend - CORS errors should be resolved!" -ForegroundColor Yellow
} else {
    Write-Host ""
    Write-Host "[ERROR] Build/deployment failed!" -ForegroundColor Red
    exit 1
}
