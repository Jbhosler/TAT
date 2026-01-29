# Comprehensive Frontend Diagnostic and Fix Script
$BUCKET_NAME = "tat-frontend-tax-aware-transition-tool"
$PROJECT_ROOT = Split-Path -Parent $PSScriptRoot
$distDir = Join-Path $PROJECT_ROOT "frontend\dist"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Frontend Diagnostic & Fix" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check what's in the bucket
Write-Host "Step 1: Checking bucket contents..." -ForegroundColor Yellow
$bucketFiles = & gsutil ls -r "gs://$BUCKET_NAME" 2>&1
if ($LASTEXITCODE -eq 0 -and $bucketFiles) {
    Write-Host "Files currently in bucket:" -ForegroundColor Gray
    $bucketFiles | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
} else {
    Write-Host "Bucket is empty or doesn't exist" -ForegroundColor Yellow
}
Write-Host ""

# Step 2: Verify local build
Write-Host "Step 2: Verifying local build..." -ForegroundColor Yellow
if (-not (Test-Path $distDir)) {
    Write-Host "ERROR: dist directory not found. Building..." -ForegroundColor Red
    Set-Location (Join-Path $PROJECT_ROOT "frontend")
    npm run build
    Set-Location $PROJECT_ROOT
}

$indexFile = Join-Path $distDir "index.html"
$assetsDir = Join-Path $distDir "assets"

if (-not (Test-Path $indexFile)) {
    Write-Host "ERROR: index.html not found!" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $assetsDir)) {
    Write-Host "ERROR: assets directory not found!" -ForegroundColor Red
    exit 1
}

# Read index.html to see what it references
$indexContent = Get-Content $indexFile -Raw
Write-Host "index.html references:" -ForegroundColor Gray
if ($indexContent -match 'src="([^"]+\.js)"') {
    Write-Host "  JS: $($matches[1])" -ForegroundColor Gray
}
if ($indexContent -match 'href="([^"]+\.css)"') {
    Write-Host "  CSS: $($matches[1])" -ForegroundColor Gray
}
Write-Host ""

# List actual files
Write-Host "Files in dist/assets:" -ForegroundColor Gray
Get-ChildItem -Path $assetsDir | ForEach-Object {
    Write-Host "  $($_.Name)" -ForegroundColor Gray
}
Write-Host ""

# Step 3: Upload files using rsync (most reliable)
Write-Host "Step 3: Uploading files..." -ForegroundColor Yellow
Write-Host "Using rsync to ensure all files are uploaded..." -ForegroundColor Gray
& gsutil -m rsync -r -d $distDir "gs://$BUCKET_NAME" 2>&1 | Out-Host

if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] Files uploaded" -ForegroundColor Green
} else {
    Write-Host "[ERROR] Upload failed!" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Step 4: Set Content-Type headers
Write-Host "Step 4: Setting Content-Type headers..." -ForegroundColor Yellow
& gsutil -m setmeta -h "Content-Type:text/html; charset=utf-8" "gs://$BUCKET_NAME/*.html" 2>&1 | Out-Null
& gsutil -m setmeta -h "Content-Type:application/javascript; charset=utf-8" "gs://$BUCKET_NAME/assets/*.js" 2>&1 | Out-Null
& gsutil -m setmeta -h "Content-Type:text/css; charset=utf-8" "gs://$BUCKET_NAME/assets/*.css" 2>&1 | Out-Null
Write-Host "[OK] Content-Type headers set" -ForegroundColor Green
Write-Host ""

# Step 5: Set permissions
Write-Host "Step 5: Setting permissions..." -ForegroundColor Yellow
& gsutil iam ch allUsers:objectViewer "gs://$BUCKET_NAME" 2>&1 | Out-Null
& gsutil web set -m index.html -e index.html "gs://$BUCKET_NAME" 2>&1 | Out-Null
Write-Host "[OK] Permissions set" -ForegroundColor Green
Write-Host ""

# Step 6: Final verification
Write-Host "Step 6: Final verification..." -ForegroundColor Yellow
$finalFiles = & gsutil ls -r "gs://$BUCKET_NAME" 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] Files in bucket:" -ForegroundColor Green
    $finalFiles | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
    
    # Check specific files
    $hasIndex = $finalFiles | Where-Object { $_ -like "*index.html" }
    $hasJS = $finalFiles | Where-Object { $_ -like "*.js" }
    $hasCSS = $finalFiles | Where-Object { $_ -like "*.css" }
    
    Write-Host ""
    if ($hasIndex) { Write-Host "[OK] index.html found" -ForegroundColor Green } else { Write-Host "[ERROR] index.html NOT found" -ForegroundColor Red }
    if ($hasJS) { Write-Host "[OK] JavaScript file(s) found" -ForegroundColor Green } else { Write-Host "[ERROR] JavaScript file(s) NOT found" -ForegroundColor Red }
    if ($hasCSS) { Write-Host "[OK] CSS file(s) found" -ForegroundColor Green } else { Write-Host "[ERROR] CSS file(s) NOT found" -ForegroundColor Red }
} else {
    Write-Host "[ERROR] Could not verify files" -ForegroundColor Red
}
Write-Host ""

# Step 7: Display URLs
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Diagnostic Complete!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Frontend URL:" -ForegroundColor Cyan
Write-Host "  https://storage.googleapis.com/$BUCKET_NAME/index.html" -ForegroundColor White
Write-Host ""
Write-Host "IMPORTANT:" -ForegroundColor Yellow
Write-Host "  1. Clear browser cache (Ctrl+Shift+Delete)" -ForegroundColor Gray
Write-Host "  2. Or use Incognito/Private mode" -ForegroundColor Gray
Write-Host "  3. Check browser console (F12) for errors" -ForegroundColor Gray
Write-Host ""
