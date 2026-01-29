# Fix 404 errors for assets - Rebuild with absolute paths and re-upload
$BUCKET_NAME = "tat-frontend-tax-aware-transition-tool"
$PROJECT_ROOT = Split-Path -Parent $PSScriptRoot
$frontendDir = Join-Path $PROJECT_ROOT "frontend"
$distDir = Join-Path $frontendDir "dist"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Fix 404 Asset Errors" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Verify vite.config.ts uses absolute paths
Write-Host "Step 1: Checking vite.config.ts..." -ForegroundColor Yellow
$viteConfigPath = Join-Path $frontendDir "vite.config.ts"
$viteConfig = Get-Content $viteConfigPath -Raw
if ($viteConfig -notmatch "base:\s*['\`"]\/['\`"]") {
    Write-Host "[WARN] vite.config.ts might not have base: '/'" -ForegroundColor Yellow
    Write-Host "Current config:" -ForegroundColor Gray
    Write-Host $viteConfig -ForegroundColor Gray
} else {
    Write-Host "[OK] vite.config.ts has base: '/'" -ForegroundColor Green
}
Write-Host ""

# Step 2: Rebuild frontend
Write-Host "Step 2: Rebuilding frontend..." -ForegroundColor Yellow
Set-Location $frontendDir
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Build complete" -ForegroundColor Green
Write-Host ""

# Step 3: Check what paths index.html uses
Write-Host "Step 3: Checking index.html paths..." -ForegroundColor Yellow
$indexFile = Join-Path $distDir "index.html"
$indexContent = Get-Content $indexFile -Raw

# Check for relative paths
if ($indexContent -match 'src="\.\/assets\/') {
    Write-Host "[WARN] index.html uses RELATIVE paths (./assets/)" -ForegroundColor Yellow
    Write-Host "This may cause 404 errors in Cloud Storage" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Fixing to use absolute paths..." -ForegroundColor Yellow
    
    # Replace relative paths with absolute paths
    $indexContent = $indexContent -replace 'src="\.\/assets\/', 'src="/assets/'
    $indexContent = $indexContent -replace 'href="\.\/assets\/', 'href="/assets/'
    
    # Save fixed index.html
    [System.IO.File]::WriteAllText($indexFile, $indexContent, [System.Text.Encoding]::UTF8)
    Write-Host "[OK] Fixed index.html to use absolute paths" -ForegroundColor Green
} elseif ($indexContent -match 'src="\/assets\/') {
    Write-Host "[OK] index.html uses ABSOLUTE paths (/assets/)" -ForegroundColor Green
} else {
    Write-Host "[WARN] Could not determine path type in index.html" -ForegroundColor Yellow
}

# Show what index.html references
Write-Host ""
Write-Host "index.html references:" -ForegroundColor Gray
if ($indexContent -match 'src="([^"]+\.js)"') {
    Write-Host "  JS: $($matches[1])" -ForegroundColor Gray
}
if ($indexContent -match 'href="([^"]+\.css)"') {
    Write-Host "  CSS: $($matches[1])" -ForegroundColor Gray
}
Write-Host ""

# Step 4: Verify files exist locally
Write-Host "Step 4: Verifying local files..." -ForegroundColor Yellow
$jsFiles = Get-ChildItem -Path (Join-Path $distDir "assets") -Filter "*.js" -ErrorAction SilentlyContinue
$cssFiles = Get-ChildItem -Path (Join-Path $distDir "assets") -Filter "*.css" -ErrorAction SilentlyContinue

if ($jsFiles) {
    Write-Host "[OK] Found JS files:" -ForegroundColor Green
    $jsFiles | ForEach-Object { Write-Host "  $($_.Name)" -ForegroundColor Gray }
} else {
    Write-Host "[ERROR] No JS files found in dist/assets/" -ForegroundColor Red
    exit 1
}

if ($cssFiles) {
    Write-Host "[OK] Found CSS files:" -ForegroundColor Green
    $cssFiles | ForEach-Object { Write-Host "  $($_.Name)" -ForegroundColor Gray }
} else {
    Write-Host "[ERROR] No CSS files found in dist/assets/" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Step 5: Upload files
Write-Host "Step 5: Uploading files to Cloud Storage..." -ForegroundColor Yellow
Set-Location $PROJECT_ROOT

# Use rsync to upload everything
& gsutil -m rsync -r -d $distDir "gs://$BUCKET_NAME" 2>&1 | Out-Host
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Upload failed!" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Files uploaded" -ForegroundColor Green
Write-Host ""

# Step 6: Set Content-Type headers
Write-Host "Step 6: Setting Content-Type headers..." -ForegroundColor Yellow

# HTML files
& gsutil -m setmeta -h "Content-Type:text/html; charset=utf-8" "gs://$BUCKET_NAME/*.html" 2>&1 | Out-Null

# JavaScript files
& gsutil -m setmeta -h "Content-Type:application/javascript; charset=utf-8" "gs://$BUCKET_NAME/assets/*.js" 2>&1 | Out-Null

# CSS files
& gsutil -m setmeta -h "Content-Type:text/css; charset=utf-8" "gs://$BUCKET_NAME/assets/*.css" 2>&1 | Out-Null

Write-Host "[OK] Content-Type headers set" -ForegroundColor Green
Write-Host ""

# Step 7: Set permissions
Write-Host "Step 7: Setting permissions..." -ForegroundColor Yellow
& gsutil iam ch allUsers:objectViewer "gs://$BUCKET_NAME" 2>&1 | Out-Null
& gsutil web set -m index.html -e index.html "gs://$BUCKET_NAME" 2>&1 | Out-Null
Write-Host "[OK] Permissions set" -ForegroundColor Green
Write-Host ""

# Step 8: Verify upload
Write-Host "Step 8: Verifying upload..." -ForegroundColor Yellow
$files = & gsutil ls -r "gs://$BUCKET_NAME" 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] Files in bucket:" -ForegroundColor Green
    $files | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
} else {
    Write-Host "[WARN] Could not verify files" -ForegroundColor Yellow
}
Write-Host ""

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Fix Complete!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Frontend URL:" -ForegroundColor Cyan
Write-Host "  https://storage.googleapis.com/$BUCKET_NAME/index.html" -ForegroundColor White
Write-Host ""
Write-Host "IMPORTANT:" -ForegroundColor Yellow
Write-Host "  1. Clear browser cache (Ctrl+Shift+Delete)" -ForegroundColor Yellow
Write-Host "  2. Or use Incognito/Private mode" -ForegroundColor Yellow
Write-Host "  3. Check browser console (F12) for any remaining errors" -ForegroundColor Yellow
Write-Host ""
