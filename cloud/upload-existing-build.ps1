# Upload Existing Build (Skip rebuild)
$BUCKET_NAME = "tat-frontend-tax-aware-transition-tool"
$PROJECT_ROOT = Split-Path -Parent $PSScriptRoot
$distDir = Join-Path $PROJECT_ROOT "frontend\dist"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Upload Existing Build" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Verify build exists
Write-Host "Step 1: Verifying build exists..." -ForegroundColor Yellow
$indexFile = Join-Path $distDir "index.html"
$assetsDir = Join-Path $distDir "assets"

if (-not (Test-Path $indexFile)) {
    Write-Host "[ERROR] index.html not found at $indexFile" -ForegroundColor Red
    Write-Host "Please run 'npm run build' in the frontend directory first" -ForegroundColor Yellow
    exit 1
}

if (-not (Test-Path $assetsDir)) {
    Write-Host "[ERROR] assets directory not found at $assetsDir" -ForegroundColor Red
    exit 1
}

# Read HTML to see what it references
$indexContent = Get-Content $indexFile -Raw
Write-Host "index.html references:" -ForegroundColor Gray
if ($indexContent -match 'src="([^"]+\.js)"') {
    $jsRef = $matches[1]
    Write-Host "  JS: $jsRef" -ForegroundColor Gray
    
    if ($jsRef -match '([^/]+\.js)$') {
        $jsFileName = $matches[1]
        $jsFile = Join-Path $assetsDir $jsFileName
        if (Test-Path $jsFile) {
            Write-Host "    [OK] File exists: $jsFileName" -ForegroundColor Green
        } else {
            Write-Host "    [ERROR] File NOT found: $jsFileName" -ForegroundColor Red
            exit 1
        }
    }
}

if ($indexContent -match 'href="([^"]+\.css)"') {
    $cssRef = $matches[1]
    Write-Host "  CSS: $cssRef" -ForegroundColor Gray
    
    if ($cssRef -match '([^/]+\.css)$') {
        $cssFileName = $matches[1]
        $cssFile = Join-Path $assetsDir $cssFileName
        if (Test-Path $cssFile) {
            Write-Host "    [OK] File exists: $cssFileName" -ForegroundColor Green
        } else {
            Write-Host "    [ERROR] File NOT found: $cssFileName" -ForegroundColor Red
            exit 1
        }
    }
}
Write-Host ""

# Step 2: Clear bucket
Write-Host "Step 2: Clearing bucket..." -ForegroundColor Yellow
Set-Location $PROJECT_ROOT
$existingFiles = & gsutil ls -r "gs://$BUCKET_NAME" 2>&1
if ($LASTEXITCODE -eq 0 -and $existingFiles) {
    Write-Host "Removing existing files..." -ForegroundColor Gray
    & gsutil -m rm -r "gs://$BUCKET_NAME/**" 2>&1 | Out-Null
    Write-Host "[OK] Bucket cleared" -ForegroundColor Green
} else {
    Write-Host "[OK] Bucket already empty" -ForegroundColor Green
}
Write-Host ""

# Step 3: Upload all files
Write-Host "Step 3: Uploading files..." -ForegroundColor Yellow
Write-Host "Uploading from: $distDir" -ForegroundColor Gray
& gsutil -m cp -r "$distDir\*" "gs://$BUCKET_NAME/" 2>&1 | Out-Host

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Upload failed!" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Files uploaded" -ForegroundColor Green
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

# Step 6: Verify upload
Write-Host "Step 6: Verifying upload..." -ForegroundColor Yellow
$uploadedFiles = & gsutil ls -r "gs://$BUCKET_NAME" 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] Files in bucket:" -ForegroundColor Green
    $uploadedFiles | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
} else {
    Write-Host "[WARN] Could not verify files" -ForegroundColor Yellow
}
Write-Host ""

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Upload Complete!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Frontend URL:" -ForegroundColor Cyan
Write-Host "  https://storage.googleapis.com/$BUCKET_NAME/index.html" -ForegroundColor White
Write-Host ""
Write-Host "CRITICAL: Test in Incognito mode with cache disabled!" -ForegroundColor Yellow
Write-Host ""
