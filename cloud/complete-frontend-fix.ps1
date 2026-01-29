# Complete Frontend Fix - Clean Rebuild and Upload
$BUCKET_NAME = "tat-frontend-tax-aware-transition-tool"
$PROJECT_ROOT = Split-Path -Parent $PSScriptRoot
$frontendDir = Join-Path $PROJECT_ROOT "frontend"
$distDir = Join-Path $frontendDir "dist"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Complete Frontend Fix" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Rebuild frontend
Write-Host "Step 1: Rebuilding frontend..." -ForegroundColor Yellow
Set-Location $frontendDir
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Build complete" -ForegroundColor Green
Write-Host ""

# Step 2: Verify build output
Write-Host "Step 2: Verifying build output..." -ForegroundColor Yellow
$indexFile = Join-Path $distDir "index.html"
$assetsDir = Join-Path $distDir "assets"

if (-not (Test-Path $indexFile)) {
    Write-Host "[ERROR] index.html not found!" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $assetsDir)) {
    Write-Host "[ERROR] assets directory not found!" -ForegroundColor Red
    exit 1
}

# Read HTML to see what it references
$indexContent = Get-Content $indexFile -Raw
Write-Host "index.html references:" -ForegroundColor Gray
if ($indexContent -match 'src="([^"]+\.js)"') {
    $jsRef = $matches[1]
    Write-Host "  JS: $jsRef" -ForegroundColor Gray
    
    # Extract filename
    if ($jsRef -match '([^/]+\.js)$') {
        $jsFileName = $matches[1]
        $jsFile = Join-Path $assetsDir $jsFileName
        if (Test-Path $jsFile) {
            Write-Host "    [OK] File exists locally: $jsFileName" -ForegroundColor Green
        } else {
            Write-Host "    [ERROR] File NOT found locally: $jsFileName" -ForegroundColor Red
            exit 1
        }
    }
}

if ($indexContent -match 'href="([^"]+\.css)"') {
    $cssRef = $matches[1]
    Write-Host "  CSS: $cssRef" -ForegroundColor Gray
    
    # Extract filename
    if ($cssRef -match '([^/]+\.css)$') {
        $cssFileName = $matches[1]
        $cssFile = Join-Path $assetsDir $cssFileName
        if (Test-Path $cssFile) {
            Write-Host "    [OK] File exists locally: $cssFileName" -ForegroundColor Green
        } else {
            Write-Host "    [ERROR] File NOT found locally: $cssFileName" -ForegroundColor Red
            exit 1
        }
    }
}

# List all files in assets
Write-Host ""
Write-Host "Files in dist/assets:" -ForegroundColor Gray
Get-ChildItem -Path $assetsDir | ForEach-Object {
    Write-Host "  $($_.Name)" -ForegroundColor Gray
}
Write-Host ""

# Step 3: Clear bucket
Write-Host "Step 3: Clearing bucket..." -ForegroundColor Yellow
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

# Step 4: Upload all files
Write-Host "Step 4: Uploading files..." -ForegroundColor Yellow
Write-Host "Uploading from: $distDir" -ForegroundColor Gray
& gsutil -m cp -r "$distDir\*" "gs://$BUCKET_NAME/" 2>&1 | Out-Host

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Upload failed!" -ForegroundColor Red
    exit 1
}
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

# Step 7: Verify upload
Write-Host "Step 7: Verifying upload..." -ForegroundColor Yellow
$uploadedFiles = & gsutil ls -r "gs://$BUCKET_NAME" 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] Files in bucket:" -ForegroundColor Green
    $uploadedFiles | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
    
    # Verify HTML references match uploaded files
    Write-Host ""
    Write-Host "Verifying file references..." -ForegroundColor Gray
    
    # Check JS file
    if ($indexContent -match 'src="([^"]+\.js)"') {
        $jsRef = $matches[1]
        if ($jsRef -match '([^/]+\.js)$') {
            $jsFileName = $matches[1]
            $jsExists = $uploadedFiles | Where-Object { $_ -like "*$jsFileName*" }
            if ($jsExists) {
                Write-Host "  [OK] JS file matches: $jsFileName" -ForegroundColor Green
            } else {
                Write-Host "  [ERROR] JS file mismatch: $jsFileName" -ForegroundColor Red
            }
        }
    }
    
    # Check CSS file
    if ($indexContent -match 'href="([^"]+\.css)"') {
        $cssRef = $matches[1]
        if ($cssRef -match '([^/]+\.css)$') {
            $cssFileName = $matches[1]
            $cssExists = $uploadedFiles | Where-Object { $_ -like "*$cssFileName*" }
            if ($cssExists) {
                Write-Host "  [OK] CSS file matches: $cssFileName" -ForegroundColor Green
            } else {
                Write-Host "  [ERROR] CSS file mismatch: $cssFileName" -ForegroundColor Red
            }
        }
    }
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
Write-Host "CRITICAL NEXT STEPS:" -ForegroundColor Yellow
Write-Host "  1. Open URL in Incognito/Private window" -ForegroundColor Gray
Write-Host "  2. Open DevTools (F12) → Network tab" -ForegroundColor Gray
Write-Host "  3. Check 'Disable cache' checkbox" -ForegroundColor Gray
Write-Host "  4. Reload page" -ForegroundColor Gray
Write-Host "  5. Verify all requests return 200 (not 404)" -ForegroundColor Gray
Write-Host "  6. Check Console tab for React errors" -ForegroundColor Gray
Write-Host ""
