# Simple Frontend Upload Script
# Uploads files one by one with verbose output

$BUCKET_NAME = "tat-frontend-tax-aware-transition-tool"
$PROJECT_ROOT = Split-Path -Parent $PSScriptRoot
$distDir = Join-Path $PROJECT_ROOT "frontend\dist"

Write-Host "Uploading frontend files..." -ForegroundColor Yellow
Write-Host ""

# Verify dist exists
if (-not (Test-Path $distDir)) {
    Write-Host "ERROR: dist directory not found. Run 'npm run build' first." -ForegroundColor Red
    exit 1
}

Write-Host "Files to upload:" -ForegroundColor Cyan
Get-ChildItem -Path $distDir -Recurse -File | ForEach-Object {
    Write-Host "  $($_.FullName.Replace($distDir, '').TrimStart('\'))" -ForegroundColor Gray
}
Write-Host ""

# Upload index.html
Write-Host "Uploading index.html..." -ForegroundColor Yellow
$indexFile = Join-Path $distDir "index.html"
if (Test-Path $indexFile) {
    & gsutil cp $indexFile "gs://$BUCKET_NAME/index.html"
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[OK] index.html uploaded" -ForegroundColor Green
    } else {
        Write-Host "[ERROR] Failed to upload index.html" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "[ERROR] index.html not found" -ForegroundColor Red
    exit 1
}

# Upload assets
$assetsDir = Join-Path $distDir "assets"
if (Test-Path $assetsDir) {
    Write-Host ""
    Write-Host "Uploading assets..." -ForegroundColor Yellow
    
    # Create assets directory in bucket first
    gsutil mkdir "gs://$BUCKET_NAME/assets" 2>&1 | Out-Null
    
    # Upload JS files
    $jsFiles = Get-ChildItem -Path $assetsDir -Filter "*.js"
    foreach ($file in $jsFiles) {
        Write-Host "  Uploading $($file.Name)..." -ForegroundColor Gray
        & gsutil cp $file.FullName "gs://$BUCKET_NAME/assets/$($file.Name)"
        if ($LASTEXITCODE -eq 0) {
            Write-Host "    [OK]" -ForegroundColor Green
        } else {
            Write-Host "    [ERROR]" -ForegroundColor Red
        }
    }
    
    # Upload CSS files
    $cssFiles = Get-ChildItem -Path $assetsDir -Filter "*.css"
    foreach ($file in $cssFiles) {
        Write-Host "  Uploading $($file.Name)..." -ForegroundColor Gray
        & gsutil cp $file.FullName "gs://$BUCKET_NAME/assets/$($file.Name)"
        if ($LASTEXITCODE -eq 0) {
            Write-Host "    [OK]" -ForegroundColor Green
        } else {
            Write-Host "    [ERROR]" -ForegroundColor Red
        }
    }
} else {
    Write-Host "[ERROR] assets directory not found" -ForegroundColor Red
    exit 1
}

# Set Content-Type headers after upload (if not set during upload)
Write-Host ""
Write-Host "Setting Content-Type headers..." -ForegroundColor Yellow
& gsutil -m setmeta -h "Content-Type:text/html; charset=utf-8" "gs://$BUCKET_NAME/*.html" 2>&1 | Out-Null
& gsutil -m setmeta -h "Content-Type:application/javascript; charset=utf-8" "gs://$BUCKET_NAME/assets/*.js" 2>&1 | Out-Null
& gsutil -m setmeta -h "Content-Type:text/css; charset=utf-8" "gs://$BUCKET_NAME/assets/*.css" 2>&1 | Out-Null
Write-Host "[OK] Content-Type headers set" -ForegroundColor Green

# Set permissions
Write-Host ""
Write-Host "Setting permissions..." -ForegroundColor Yellow
& gsutil iam ch allUsers:objectViewer "gs://$BUCKET_NAME" 2>&1 | Out-Null
& gsutil web set -m index.html -e index.html "gs://$BUCKET_NAME" 2>&1 | Out-Null
Write-Host "[OK] Permissions set" -ForegroundColor Green

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Upload Complete!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Frontend URL:" -ForegroundColor Cyan
Write-Host "  https://storage.googleapis.com/$BUCKET_NAME/index.html" -ForegroundColor White
Write-Host ""
