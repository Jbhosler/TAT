# Verify assets are uploaded and fix if missing
$BUCKET_NAME = "tat-frontend-tax-aware-transition-tool"
$PROJECT_ROOT = Split-Path -Parent $PSScriptRoot
$distDir = Join-Path $PROJECT_ROOT "frontend\dist"
$assetsDir = Join-Path $distDir "assets"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Verify and Upload Assets" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check what's in the bucket
Write-Host "Step 1: Checking bucket contents..." -ForegroundColor Yellow
$bucketFiles = & gsutil ls -r "gs://$BUCKET_NAME" 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "Files currently in bucket:" -ForegroundColor Gray
    $bucketFiles | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
    
    # Check if assets folder exists
    $hasAssets = $bucketFiles | Where-Object { $_ -like "*assets/*" }
    if ($hasAssets) {
        Write-Host ""
        Write-Host "[OK] Assets folder found in bucket" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "[WARN] Assets folder NOT found in bucket!" -ForegroundColor Yellow
    }
} else {
    Write-Host "[ERROR] Could not list bucket contents" -ForegroundColor Red
}
Write-Host ""

# Step 2: Check local assets folder
Write-Host "Step 2: Checking local assets folder..." -ForegroundColor Yellow
if (Test-Path $assetsDir) {
    $jsFiles = Get-ChildItem -Path $assetsDir -Filter "*.js" -ErrorAction SilentlyContinue
    $cssFiles = Get-ChildItem -Path $assetsDir -Filter "*.css" -ErrorAction SilentlyContinue
    
    Write-Host "Local assets:" -ForegroundColor Gray
    if ($jsFiles) {
        Write-Host "  JS files:" -ForegroundColor Gray
        $jsFiles | ForEach-Object { Write-Host "    $($_.Name)" -ForegroundColor Gray }
    }
    if ($cssFiles) {
        Write-Host "  CSS files:" -ForegroundColor Gray
        $cssFiles | ForEach-Object { Write-Host "    $($_.Name)" -ForegroundColor Gray }
    }
    
    if (-not $jsFiles -and -not $cssFiles) {
        Write-Host "[ERROR] No assets found locally!" -ForegroundColor Red
        Write-Host "Please run 'npm run build' in the frontend directory first" -ForegroundColor Yellow
        exit 1
    }
} else {
    Write-Host "[ERROR] Assets directory not found at $assetsDir" -ForegroundColor Red
    Write-Host "Please run 'npm run build' in the frontend directory first" -ForegroundColor Yellow
    exit 1
}
Write-Host ""

# Step 3: Upload assets if missing
Write-Host "Step 3: Uploading assets..." -ForegroundColor Yellow
Set-Location $PROJECT_ROOT

# Upload assets folder explicitly
Write-Host "Uploading assets folder..." -ForegroundColor Gray
& gsutil -m cp -r "$assetsDir" "gs://$BUCKET_NAME/" 2>&1 | Out-Host

if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] Assets uploaded" -ForegroundColor Green
} else {
    Write-Host "[WARN] Upload may have had issues" -ForegroundColor Yellow
}
Write-Host ""

# Step 4: Set Content-Type headers for assets
Write-Host "Step 4: Setting Content-Type headers for assets..." -ForegroundColor Yellow

# JavaScript files
Write-Host "  Setting JavaScript Content-Type..." -ForegroundColor Gray
& gsutil -m setmeta -h "Content-Type:application/javascript; charset=utf-8" "gs://$BUCKET_NAME/assets/*.js" 2>&1 | Out-Null

# CSS files
Write-Host "  Setting CSS Content-Type..." -ForegroundColor Gray
& gsutil -m setmeta -h "Content-Type:text/css; charset=utf-8" "gs://$BUCKET_NAME/assets/*.css" 2>&1 | Out-Null

Write-Host "[OK] Content-Type headers set" -ForegroundColor Green
Write-Host ""

# Step 5: Verify upload
Write-Host "Step 5: Verifying upload..." -ForegroundColor Yellow
$finalFiles = & gsutil ls -r "gs://$BUCKET_NAME" 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] Final bucket contents:" -ForegroundColor Green
    $finalFiles | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
    
    # Check specific files
    $hasJS = $finalFiles | Where-Object { $_ -like "*.js" }
    $hasCSS = $finalFiles | Where-Object { $_ -like "*.css" }
    
    Write-Host ""
    if ($hasJS) { 
        Write-Host "[OK] JavaScript file(s) found" -ForegroundColor Green 
    } else { 
        Write-Host "[ERROR] JavaScript file(s) NOT found" -ForegroundColor Red 
    }
    if ($hasCSS) { 
        Write-Host "[OK] CSS file(s) found" -ForegroundColor Green 
    } else { 
        Write-Host "[ERROR] CSS file(s) NOT found" -ForegroundColor Red 
    }
} else {
    Write-Host "[WARN] Could not verify files" -ForegroundColor Yellow
}
Write-Host ""

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Verification Complete!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Test URLs:" -ForegroundColor Cyan
if ($jsFiles) {
    $jsName = $jsFiles[0].Name
    Write-Host "  JS: https://storage.googleapis.com/$BUCKET_NAME/assets/$jsName" -ForegroundColor White
}
if ($cssFiles) {
    $cssName = $cssFiles[0].Name
    Write-Host "  CSS: https://storage.googleapis.com/$BUCKET_NAME/assets/$cssName" -ForegroundColor White
}
Write-Host ""
Write-Host "Main URL:" -ForegroundColor Cyan
Write-Host "  https://storage.googleapis.com/$BUCKET_NAME/index.html" -ForegroundColor White
Write-Host ""
Write-Host "CRITICAL: Clear browser cache or use Incognito mode!" -ForegroundColor Yellow
Write-Host ""
