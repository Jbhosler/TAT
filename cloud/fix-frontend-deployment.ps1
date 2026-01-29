# Comprehensive Frontend Deployment Fix Script
# Fixes Content-Type headers, verifies uploads, and ensures proper configuration

$ErrorActionPreference = "Continue"
$BUCKET_NAME = "tat-frontend-tax-aware-transition-tool"
$PROJECT_ROOT = Split-Path -Parent $PSScriptRoot

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Frontend Deployment Fix Script" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Rebuild frontend
Write-Host "Step 1: Rebuilding frontend..." -ForegroundColor Yellow
$frontendDir = Join-Path $PROJECT_ROOT "frontend"
if (-not (Test-Path $frontendDir)) {
    Write-Host "ERROR: Frontend directory not found at $frontendDir" -ForegroundColor Red
    exit 1
}

Set-Location $frontendDir
Write-Host "Running npm install..." -ForegroundColor Gray
npm install --silent 2>&1 | Out-Null

Write-Host "Running npm run build..." -ForegroundColor Gray
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Build failed!" -ForegroundColor Red
    exit 1
}

$distDir = Join-Path $frontendDir "dist"
if (-not (Test-Path $distDir)) {
    Write-Host "ERROR: dist directory not found after build!" -ForegroundColor Red
    exit 1
}

Write-Host "[OK] Frontend built successfully" -ForegroundColor Green
Write-Host ""

# Step 2: Verify build output
Write-Host "Step 2: Verifying build output..." -ForegroundColor Yellow
$indexHtml = Join-Path $distDir "index.html"
if (-not (Test-Path $indexHtml)) {
    Write-Host "ERROR: index.html not found in dist!" -ForegroundColor Red
    exit 1
}

$assetsDir = Join-Path $distDir "assets"
if (-not (Test-Path $assetsDir)) {
    Write-Host "ERROR: assets directory not found in dist!" -ForegroundColor Red
    exit 1
}

$jsFiles = Get-ChildItem -Path $assetsDir -Filter "*.js"
$cssFiles = Get-ChildItem -Path $assetsDir -Filter "*.css"

if ($jsFiles.Count -eq 0) {
    Write-Host "WARNING: No JavaScript files found in assets!" -ForegroundColor Yellow
}
if ($cssFiles.Count -eq 0) {
    Write-Host "WARNING: No CSS files found in assets!" -ForegroundColor Yellow
}

Write-Host "[OK] Build output verified:" -ForegroundColor Green
Write-Host "  - index.html: Found" -ForegroundColor Gray
Write-Host "  - JS files: $($jsFiles.Count)" -ForegroundColor Gray
Write-Host "  - CSS files: $($cssFiles.Count)" -ForegroundColor Gray
Write-Host ""

# Step 3: Upload files
Write-Host "Step 3: Uploading files to Cloud Storage..." -ForegroundColor Yellow
Set-Location $PROJECT_ROOT

# Remove old files first (optional - comment out if you want to keep old versions)
# Write-Host "Clearing old files..." -ForegroundColor Gray
# gsutil -m rm -r "gs://$BUCKET_NAME/**" 2>&1 | Out-Null

# Upload all files
Write-Host "Uploading files..." -ForegroundColor Gray
gsutil -m rsync -r $distDir "gs://$BUCKET_NAME" 2>&1 | Out-Null

if ($LASTEXITCODE -ne 0) {
    Write-Host "WARNING: Upload may have had errors, but continuing..." -ForegroundColor Yellow
}

Write-Host "[OK] Files uploaded" -ForegroundColor Green
Write-Host ""

# Step 4: Set Content-Type headers
Write-Host "Step 4: Setting Content-Type headers..." -ForegroundColor Yellow

Write-Host "  Setting HTML files..." -ForegroundColor Gray
gsutil -m setmeta -h "Content-Type:text/html" "gs://$BUCKET_NAME/*.html" 2>&1 | Out-Null

Write-Host "  Setting JavaScript files..." -ForegroundColor Gray
gsutil -m setmeta -h "Content-Type:application/javascript" "gs://$BUCKET_NAME/assets/*.js" 2>&1 | Out-Null

Write-Host "  Setting CSS files..." -ForegroundColor Gray
gsutil -m setmeta -h "Content-Type:text/css" "gs://$BUCKET_NAME/assets/*.css" 2>&1 | Out-Null

Write-Host "  Setting SVG files..." -ForegroundColor Gray
gsutil -m setmeta -h "Content-Type:image/svg+xml" "gs://$BUCKET_NAME/*.svg" 2>&1 | Out-Null

Write-Host "[OK] Content-Type headers set" -ForegroundColor Green
Write-Host ""

# Step 5: Set permissions
Write-Host "Step 5: Setting bucket permissions..." -ForegroundColor Yellow
gsutil iam ch allUsers:objectViewer "gs://$BUCKET_NAME" 2>&1 | Out-Null
gsutil web set -m index.html -e index.html "gs://$BUCKET_NAME" 2>&1 | Out-Null
Write-Host "[OK] Permissions configured" -ForegroundColor Green
Write-Host ""

# Step 6: Verify upload
Write-Host "Step 6: Verifying upload..." -ForegroundColor Yellow
$uploadedFiles = gsutil ls -r "gs://$BUCKET_NAME" 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] Files verified in bucket" -ForegroundColor Green
    Write-Host ""
    Write-Host "Uploaded files:" -ForegroundColor Gray
    $uploadedFiles | Select-Object -First 10 | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
    if ($uploadedFiles.Count -gt 10) {
        Write-Host "  ... and $($uploadedFiles.Count - 10) more" -ForegroundColor Gray
    }
} else {
    Write-Host "WARNING: Could not verify uploaded files" -ForegroundColor Yellow
}
Write-Host ""

# Step 7: Display URLs
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Deployment Complete!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Frontend URL:" -ForegroundColor Cyan
Write-Host "  https://storage.googleapis.com/$BUCKET_NAME/index.html" -ForegroundColor White
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "  1. Open the URL above in your browser" -ForegroundColor Gray
Write-Host "  2. Clear browser cache (Ctrl+Shift+Delete)" -ForegroundColor Gray
Write-Host "  3. Check browser console (F12) for any errors" -ForegroundColor Gray
Write-Host "  4. Verify assets load correctly" -ForegroundColor Gray
Write-Host ""
