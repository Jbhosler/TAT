# Fix HashRouter and Redeploy Frontend
$BUCKET_NAME = "tat-frontend-tax-aware-transition-tool"
$PROJECT_ROOT = Split-Path -Parent $PSScriptRoot
$frontendDir = Join-Path $PROJECT_ROOT "frontend"
$distDir = Join-Path $frontendDir "dist"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Fix HashRouter and Redeploy" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Verify App.tsx uses HashRouter
Write-Host "Step 1: Verifying App.tsx uses HashRouter..." -ForegroundColor Yellow
$appFile = Join-Path $frontendDir "src\App.tsx"
$appContent = Get-Content $appFile -Raw

if ($appContent -match "HashRouter") {
    Write-Host "[OK] App.tsx uses HashRouter" -ForegroundColor Green
} elseif ($appContent -match "BrowserRouter") {
    Write-Host "[WARN] App.tsx still uses BrowserRouter!" -ForegroundColor Yellow
    Write-Host "Please update App.tsx to use HashRouter first" -ForegroundColor Yellow
    exit 1
} else {
    Write-Host "[WARN] Could not determine router type" -ForegroundColor Yellow
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

# Step 3: Verify index.html paths
Write-Host "Step 3: Verifying index.html..." -ForegroundColor Yellow
$indexFile = Join-Path $distDir "index.html"
if (Test-Path $indexFile) {
    $indexContent = Get-Content $indexFile -Raw
    
    # Check if using absolute paths
    if ($indexContent -match 'src="\/assets\/') {
        Write-Host "[OK] index.html uses absolute paths" -ForegroundColor Green
    } else {
        Write-Host "[WARN] index.html might not use absolute paths" -ForegroundColor Yellow
    }
    
    Write-Host "index.html references:" -ForegroundColor Gray
    if ($indexContent -match 'src="([^"]+\.js)"') {
        Write-Host "  JS: $($matches[1])" -ForegroundColor Gray
    }
    if ($indexContent -match 'href="([^"]+\.css)"') {
        Write-Host "  CSS: $($matches[1])" -ForegroundColor Gray
    }
} else {
    Write-Host "[ERROR] index.html not found!" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Step 4: Upload files
Write-Host "Step 4: Uploading files..." -ForegroundColor Yellow
Set-Location $PROJECT_ROOT
& gsutil -m rsync -r -d $distDir "gs://$BUCKET_NAME" 2>&1 | Out-Host
Write-Host "[OK] Files uploaded" -ForegroundColor Green
Write-Host ""

# Step 5: Set Content-Type headers
Write-Host "Step 5: Setting Content-Type headers..." -ForegroundColor Yellow
& gsutil -m setmeta -h "Content-Type:text/html; charset=utf-8" "gs://$BUCKET_NAME/*.html" 2>&1 | Out-Null
& gsutil -m setmeta -h "Content-Type:application/javascript; charset=utf-8" "gs://$BUCKET_NAME/assets/*.js" 2>&1 | Out-Null
& gsutil -m setmeta -h "Content-Type:text/css; charset=utf-8" "gs://$BUCKET_NAME/assets/*.css" 2>&1 | Out-Null
Write-Host "[OK] Content-Type headers set" -ForegroundColor Green
Write-Host ""

# Step 6: Set permissions
Write-Host "Step 6: Setting permissions..." -ForegroundColor Yellow
& gsutil iam ch allUsers:objectViewer "gs://$BUCKET_NAME" 2>&1 | Out-Null
& gsutil web set -m index.html -e index.html "gs://$BUCKET_NAME" 2>&1 | Out-Null
Write-Host "[OK] Permissions set" -ForegroundColor Green
Write-Host ""

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Deployment Complete!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Frontend URL:" -ForegroundColor Cyan
Write-Host "  https://storage.googleapis.com/$BUCKET_NAME/index.html" -ForegroundColor White
Write-Host ""
Write-Host "IMPORTANT:" -ForegroundColor Yellow
Write-Host "  1. Clear browser cache (Ctrl+Shift+Delete) or use Incognito mode" -ForegroundColor Gray
Write-Host "  2. URLs will now use hash fragments: index.html#/dashboard" -ForegroundColor Gray
Write-Host "  3. Check browser console (F12) to verify React is rendering" -ForegroundColor Gray
Write-Host ""
