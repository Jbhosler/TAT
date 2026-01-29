# Verify and Fix Frontend Deployment
# Checks what's actually in the bucket and fixes any issues

$BUCKET_NAME = "tat-frontend-tax-aware-transition-tool"
$PROJECT_ROOT = Split-Path -Parent $PSScriptRoot

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Frontend Verification & Fix Script" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check what's currently in the bucket
Write-Host "Step 1: Checking current bucket contents..." -ForegroundColor Yellow
$bucketFiles = gsutil ls -r "gs://$BUCKET_NAME" 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "Files currently in bucket:" -ForegroundColor Gray
    $bucketFiles | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
    Write-Host ""
} else {
    Write-Host "WARNING: Could not list bucket files" -ForegroundColor Yellow
    Write-Host ""
}

# Step 2: Check what index.html references
Write-Host "Step 2: Checking what index.html references..." -ForegroundColor Yellow
$frontendDir = Join-Path $PROJECT_ROOT "frontend"
$distDir = Join-Path $frontendDir "dist"
$indexHtml = Join-Path $distDir "index.html"

if (Test-Path $indexHtml) {
    $htmlContent = Get-Content $indexHtml -Raw
    Write-Host "index.html references:" -ForegroundColor Gray
    
    # Extract JS file reference
    if ($htmlContent -match 'src="([^"]+\.js)"') {
        $jsRef = $matches[1]
        Write-Host "  JS: $jsRef" -ForegroundColor Gray
    }
    
    # Extract CSS file reference
    if ($htmlContent -match 'href="([^"]+\.css)"') {
        $cssRef = $matches[1]
        Write-Host "  CSS: $cssRef" -ForegroundColor Gray
    }
    
    Write-Host ""
} else {
    Write-Host "ERROR: index.html not found locally. Need to rebuild." -ForegroundColor Red
    Write-Host ""
}

# Step 3: Rebuild frontend
Write-Host "Step 3: Rebuilding frontend..." -ForegroundColor Yellow
Set-Location $frontendDir

Write-Host "Running npm run build..." -ForegroundColor Gray
npm run build 2>&1 | Out-Host

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "[OK] Build complete" -ForegroundColor Green
Write-Host ""

# Step 4: Verify dist folder contents
Write-Host "Step 4: Verifying dist folder..." -ForegroundColor Yellow
$assetsDir = Join-Path $distDir "assets"

if (-not (Test-Path $assetsDir)) {
    Write-Host "ERROR: assets directory not found!" -ForegroundColor Red
    exit 1
}

$jsFiles = Get-ChildItem -Path $assetsDir -Filter "*.js" | Select-Object -First 1
$cssFiles = Get-ChildItem -Path $assetsDir -Filter "*.css" | Select-Object -First 1

Write-Host "Files in dist/assets:" -ForegroundColor Gray
Get-ChildItem -Path $assetsDir | ForEach-Object { Write-Host "  $($_.Name)" -ForegroundColor Gray }
Write-Host ""

# Step 5: Clear bucket and upload fresh
Write-Host "Step 5: Uploading fresh files..." -ForegroundColor Yellow
Set-Location $PROJECT_ROOT

Write-Host "Clearing old files from bucket..." -ForegroundColor Gray
gsutil -m rm -r "gs://$BUCKET_NAME/**" 2>&1 | Out-Null

Write-Host "Uploading new files..." -ForegroundColor Gray
gsutil -m cp -r "$distDir/*" "gs://$BUCKET_NAME/" 2>&1 | Out-Null

# Alternative: Use rsync but ensure it syncs correctly
Write-Host "Syncing files..." -ForegroundColor Gray
gsutil -m rsync -r -d $distDir "gs://$BUCKET_NAME" 2>&1 | Out-Host

Write-Host "[OK] Files uploaded" -ForegroundColor Green
Write-Host ""

# Step 6: Set Content-Type headers
Write-Host "Step 6: Setting Content-Type headers..." -ForegroundColor Yellow

# HTML files
Write-Host "  Setting HTML..." -ForegroundColor Gray
gsutil -m setmeta -h "Content-Type:text/html; charset=utf-8" "gs://$BUCKET_NAME/*.html" 2>&1 | Out-Null

# JavaScript files
Write-Host "  Setting JavaScript..." -ForegroundColor Gray
gsutil -m setmeta -h "Content-Type:application/javascript; charset=utf-8" "gs://$BUCKET_NAME/assets/*.js" 2>&1 | Out-Null

# CSS files
Write-Host "  Setting CSS..." -ForegroundColor Gray
gsutil -m setmeta -h "Content-Type:text/css; charset=utf-8" "gs://$BUCKET_NAME/assets/*.css" 2>&1 | Out-Null

# SVG files
Write-Host "  Setting SVG..." -ForegroundColor Gray
gsutil -m setmeta -h "Content-Type:image/svg+xml" "gs://$BUCKET_NAME/*.svg" 2>&1 | Out-Null

Write-Host "[OK] Content-Type headers set" -ForegroundColor Green
Write-Host ""

# Step 7: Set permissions
Write-Host "Step 7: Setting permissions..." -ForegroundColor Yellow
gsutil iam ch allUsers:objectViewer "gs://$BUCKET_NAME" 2>&1 | Out-Null
gsutil web set -m index.html -e index.html "gs://$BUCKET_NAME" 2>&1 | Out-Null
Write-Host "[OK] Permissions configured" -ForegroundColor Green
Write-Host ""

# Step 8: Verify upload
Write-Host "Step 8: Verifying upload..." -ForegroundColor Yellow
$uploadedFiles = gsutil ls -r "gs://$BUCKET_NAME" 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] Verification complete" -ForegroundColor Green
    Write-Host ""
    Write-Host "Uploaded files:" -ForegroundColor Gray
    $uploadedFiles | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
    Write-Host ""
    
    # Check if the specific files exist
    if ($jsFiles) {
        $jsFileName = $jsFiles.Name
        $jsExists = $uploadedFiles | Where-Object { $_ -like "*$jsFileName*" }
        if ($jsExists) {
            Write-Host "[OK] JavaScript file found: $jsFileName" -ForegroundColor Green
        } else {
            Write-Host "[WARN] JavaScript file NOT found: $jsFileName" -ForegroundColor Yellow
        }
    }
    
    if ($cssFiles) {
        $cssFileName = $cssFiles.Name
        $cssExists = $uploadedFiles | Where-Object { $_ -like "*$cssFileName*" }
        if ($cssExists) {
            Write-Host "[OK] CSS file found: $cssFileName" -ForegroundColor Green
        } else {
            Write-Host "[WARN] CSS file NOT found: $cssFileName" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "WARNING: Could not verify uploaded files" -ForegroundColor Yellow
}
Write-Host ""

# Step 9: Display test URLs
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Deployment Complete!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Test URLs:" -ForegroundColor Cyan
Write-Host "  Main: https://storage.googleapis.com/$BUCKET_NAME/index.html" -ForegroundColor White
if ($jsFiles) {
    $jsPath = "assets/$($jsFiles.Name)"
    Write-Host "  JS: https://storage.googleapis.com/$BUCKET_NAME/$jsPath" -ForegroundColor White
}
if ($cssFiles) {
    $cssPath = "assets/$($cssFiles.Name)"
    Write-Host "  CSS: https://storage.googleapis.com/$BUCKET_NAME/$cssPath" -ForegroundColor White
}
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "  1. Test the JS and CSS URLs directly in browser" -ForegroundColor Gray
Write-Host "  2. Clear browser cache (Ctrl+Shift+Delete)" -ForegroundColor Gray
Write-Host "  3. Open main URL and check console (F12)" -ForegroundColor Gray
Write-Host ""
