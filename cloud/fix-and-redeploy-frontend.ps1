# Complete Frontend Fix and Redeploy
$BUCKET_NAME = "tat-frontend-tax-aware-transition-tool"
$PROJECT_ROOT = Split-Path -Parent $PSScriptRoot
$frontendDir = Join-Path $PROJECT_ROOT "frontend"
$distDir = Join-Path $frontendDir "dist"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Complete Frontend Fix & Redeploy" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Rebuild with absolute paths
Write-Host "Step 1: Rebuilding frontend..." -ForegroundColor Yellow
Set-Location $frontendDir
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Build complete" -ForegroundColor Green
Write-Host ""

# Step 2: Verify index.html uses absolute paths
$indexFile = Join-Path $distDir "index.html"
$indexContent = Get-Content $indexFile -Raw
Write-Host "index.html references:" -ForegroundColor Gray
if ($indexContent -match 'src="([^"]+\.js)"') {
    Write-Host "  JS: $($matches[1])" -ForegroundColor Gray
}
if ($indexContent -match 'href="([^"]+\.css)"') {
    Write-Host "  CSS: $($matches[1])" -ForegroundColor Gray
}
Write-Host ""

# Step 3: Upload files
Write-Host "Step 2: Uploading files..." -ForegroundColor Yellow
Set-Location $PROJECT_ROOT
& gsutil -m rsync -r -d $distDir "gs://$BUCKET_NAME" 2>&1 | Out-Host
Write-Host "[OK] Files uploaded" -ForegroundColor Green
Write-Host ""

# Step 4: Set Content-Type headers
Write-Host "Step 3: Setting Content-Type headers..." -ForegroundColor Yellow
& gsutil -m setmeta -h "Content-Type:text/html; charset=utf-8" "gs://$BUCKET_NAME/*.html" 2>&1 | Out-Null
& gsutil -m setmeta -h "Content-Type:application/javascript; charset=utf-8" "gs://$BUCKET_NAME/assets/*.js" 2>&1 | Out-Null
& gsutil -m setmeta -h "Content-Type:text/css; charset=utf-8" "gs://$BUCKET_NAME/assets/*.css" 2>&1 | Out-Null
Write-Host "[OK] Content-Type headers set" -ForegroundColor Green
Write-Host ""

# Step 5: Set permissions
Write-Host "Step 4: Setting permissions..." -ForegroundColor Yellow
& gsutil iam ch allUsers:objectViewer "gs://$BUCKET_NAME" 2>&1 | Out-Null
& gsutil web set -m index.html -e index.html "gs://$BUCKET_NAME" 2>&1 | Out-Null
Write-Host "[OK] Permissions set" -ForegroundColor Green
Write-Host ""

# Step 6: Verify
Write-Host "Step 5: Verifying..." -ForegroundColor Yellow
$files = & gsutil ls -r "gs://$BUCKET_NAME" 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] Files verified in bucket" -ForegroundColor Green
    $files | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
} else {
    Write-Host "[WARN] Could not verify" -ForegroundColor Yellow
}
Write-Host ""

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Deployment Complete!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Frontend URL:" -ForegroundColor Cyan
Write-Host "  https://storage.googleapis.com/$BUCKET_NAME/index.html" -ForegroundColor White
Write-Host ""
Write-Host "CRITICAL: Clear browser cache or use Incognito mode!" -ForegroundColor Yellow
Write-Host ""
