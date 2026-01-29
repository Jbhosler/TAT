# Quick fix: Update index.html paths and re-upload
$BUCKET_NAME = "tat-frontend-tax-aware-transition-tool"
$PROJECT_ROOT = Split-Path -Parent $PSScriptRoot
$distDir = Join-Path $PROJECT_ROOT "frontend\dist"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Quick Fix: Update Paths and Re-upload" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Fix index.html paths (if not already fixed)
Write-Host "Step 1: Checking index.html..." -ForegroundColor Yellow
$indexFile = Join-Path $distDir "index.html"
if (Test-Path $indexFile) {
    $indexContent = Get-Content $indexFile -Raw
    
    if ($indexContent -match 'src="\.\/assets\/') {
        Write-Host "[FIX] Converting relative paths to absolute paths..." -ForegroundColor Yellow
        $indexContent = $indexContent -replace 'src="\.\/assets\/', 'src="/assets/'
        $indexContent = $indexContent -replace 'href="\.\/assets\/', 'href="/assets/'
        [System.IO.File]::WriteAllText($indexFile, $indexContent, [System.Text.Encoding]::UTF8)
        Write-Host "[OK] Fixed paths in index.html" -ForegroundColor Green
    } else {
        Write-Host "[OK] index.html already uses absolute paths" -ForegroundColor Green
    }
    
    # Show what it references now
    Write-Host ""
    Write-Host "index.html now references:" -ForegroundColor Gray
    if ($indexContent -match 'src="([^"]+\.js)"') {
        Write-Host "  JS: $($matches[1])" -ForegroundColor Gray
    }
    if ($indexContent -match 'href="([^"]+\.css)"') {
        Write-Host "  CSS: $($matches[1])" -ForegroundColor Gray
    }
} else {
    Write-Host "[ERROR] index.html not found at $indexFile" -ForegroundColor Red
    Write-Host "Please run 'npm run build' in the frontend directory first" -ForegroundColor Yellow
    exit 1
}
Write-Host ""

# Step 2: Upload files
Write-Host "Step 2: Uploading files..." -ForegroundColor Yellow
Set-Location $PROJECT_ROOT
& gsutil -m rsync -r -d $distDir "gs://$BUCKET_NAME" 2>&1 | Out-Host
Write-Host "[OK] Files uploaded" -ForegroundColor Green
Write-Host ""

# Step 3: Set Content-Type headers
Write-Host "Step 3: Setting Content-Type headers..." -ForegroundColor Yellow
& gsutil -m setmeta -h "Content-Type:text/html; charset=utf-8" "gs://$BUCKET_NAME/*.html" 2>&1 | Out-Null
& gsutil -m setmeta -h "Content-Type:application/javascript; charset=utf-8" "gs://$BUCKET_NAME/assets/*.js" 2>&1 | Out-Null
& gsutil -m setmeta -h "Content-Type:text/css; charset=utf-8" "gs://$BUCKET_NAME/assets/*.css" 2>&1 | Out-Null
Write-Host "[OK] Content-Type headers set" -ForegroundColor Green
Write-Host ""

# Step 4: Set permissions
Write-Host "Step 4: Setting permissions..." -ForegroundColor Yellow
& gsutil iam ch allUsers:objectViewer "gs://$BUCKET_NAME" 2>&1 | Out-Null
& gsutil web set -m index.html -e index.html "gs://$BUCKET_NAME" 2>&1 | Out-Null
Write-Host "[OK] Permissions set" -ForegroundColor Green
Write-Host ""

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Fix Complete!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Frontend URL:" -ForegroundColor Cyan
Write-Host "  https://storage.googleapis.com/$BUCKET_NAME/index.html" -ForegroundColor White
Write-Host ""
Write-Host "CRITICAL: Clear browser cache or use Incognito mode!" -ForegroundColor Yellow
Write-Host ""
