# Final Frontend Fix - Rebuilds with relative paths and fixes Content-Types
$BUCKET_NAME = "tat-frontend-tax-aware-transition-tool"
$PROJECT_ROOT = Split-Path -Parent $PSScriptRoot
$frontendDir = Join-Path $PROJECT_ROOT "frontend"
$distDir = Join-Path $frontendDir "dist"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Final Frontend Fix" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Rebuild with relative paths
Write-Host "Step 1: Rebuilding frontend with relative paths..." -ForegroundColor Yellow
Set-Location $frontendDir

# Verify vite.config.ts has base: './'
$viteConfig = Get-Content "vite.config.ts" -Raw
if ($viteConfig -notmatch "base:\s*['\`"]\.\/['\`"]") {
    Write-Host "WARNING: vite.config.ts might not have base: './'" -ForegroundColor Yellow
}

npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Build failed!" -ForegroundColor Red
    exit 1
}

# Verify index.html uses relative paths
$indexContent = Get-Content "$distDir/index.html" -Raw
if ($indexContent -match 'src="\.\/assets\/') {
    Write-Host "[OK] index.html uses relative paths" -ForegroundColor Green
} else {
    Write-Host "WARNING: index.html might not use relative paths" -ForegroundColor Yellow
    Write-Host "Content: $($indexContent -replace '`n', ' ')" -ForegroundColor Gray
}

Write-Host ""

# Step 2: Clear bucket completely (but verify it exists first)
Write-Host "Step 2: Clearing bucket..." -ForegroundColor Yellow
Set-Location $PROJECT_ROOT

# Check if bucket exists
$bucketCheck = gsutil ls -b "gs://$BUCKET_NAME" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Bucket doesn't exist, creating it..." -ForegroundColor Yellow
    gsutil mb -p "tax-aware-transition-tool" -c STANDARD -l "us-central1" "gs://$BUCKET_NAME" 2>&1 | Out-Host
}

# Clear bucket contents
Write-Host "Removing old files..." -ForegroundColor Gray
gsutil -m rm -r "gs://$BUCKET_NAME/**" 2>&1 | Out-Null
Write-Host "[OK] Bucket cleared" -ForegroundColor Green
Write-Host ""

# Step 3: Upload files with explicit Content-Type headers
Write-Host "Step 3: Uploading files with correct Content-Type headers..." -ForegroundColor Yellow

# Verify dist directory exists
if (-not (Test-Path $distDir)) {
    Write-Host "ERROR: dist directory not found at $distDir" -ForegroundColor Red
    exit 1
}

# Upload HTML files with Content-Type
Write-Host "  Uploading HTML..." -ForegroundColor Gray
$htmlFiles = Get-ChildItem -Path $distDir -Filter "*.html"
if ($htmlFiles) {
    foreach ($file in $htmlFiles) {
        Write-Host "    Uploading $($file.Name)..." -ForegroundColor DarkGray
        $uploadCmd = "gsutil cp -h `"Content-Type:text/html; charset=utf-8`" `"$($file.FullName)`" `"gs://$BUCKET_NAME/$($file.Name)`""
        $result = Invoke-Expression $uploadCmd 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Host "    ERROR uploading $($file.Name)" -ForegroundColor Red
            Write-Host "    Command: $uploadCmd" -ForegroundColor Gray
            Write-Host "    Result: $result" -ForegroundColor Gray
        } else {
            Write-Host "    [OK] $($file.Name) uploaded" -ForegroundColor Green
        }
    }
} else {
    Write-Host "    ERROR: No HTML files found in $distDir" -ForegroundColor Red
    Write-Host "    Files in dist: $(Get-ChildItem -Path $distDir | Select-Object -ExpandProperty Name)" -ForegroundColor Gray
    exit 1
}

# Upload JS files with Content-Type
Write-Host "  Uploading JavaScript..." -ForegroundColor Gray
$assetsDir = Join-Path $distDir "assets"
if (Test-Path $assetsDir) {
    $jsFiles = Get-ChildItem -Path $assetsDir -Filter "*.js"
    if ($jsFiles) {
        foreach ($file in $jsFiles) {
            Write-Host "    Uploading $($file.Name)..." -ForegroundColor DarkGray
            $uploadCmd = "gsutil cp -h `"Content-Type:application/javascript; charset=utf-8`" `"$($file.FullName)`" `"gs://$BUCKET_NAME/assets/$($file.Name)`""
            $result = Invoke-Expression $uploadCmd 2>&1
            if ($LASTEXITCODE -ne 0) {
                Write-Host "    ERROR uploading $($file.Name)" -ForegroundColor Red
                Write-Host "    Result: $result" -ForegroundColor Gray
            } else {
                Write-Host "    [OK] $($file.Name) uploaded" -ForegroundColor Green
            }
        }
    } else {
        Write-Host "    ERROR: No JS files found in $assetsDir" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "    ERROR: assets directory not found at $assetsDir" -ForegroundColor Red
    exit 1
}

# Upload CSS files with Content-Type
Write-Host "  Uploading CSS..." -ForegroundColor Gray
if (Test-Path $assetsDir) {
    $cssFiles = Get-ChildItem -Path $assetsDir -Filter "*.css"
    if ($cssFiles) {
        foreach ($file in $cssFiles) {
            Write-Host "    Uploading $($file.Name)..." -ForegroundColor DarkGray
            $uploadCmd = "gsutil cp -h `"Content-Type:text/css; charset=utf-8`" `"$($file.FullName)`" `"gs://$BUCKET_NAME/assets/$($file.Name)`""
            $result = Invoke-Expression $uploadCmd 2>&1
            if ($LASTEXITCODE -ne 0) {
                Write-Host "    ERROR uploading $($file.Name)" -ForegroundColor Red
                Write-Host "    Result: $result" -ForegroundColor Gray
            } else {
                Write-Host "    [OK] $($file.Name) uploaded" -ForegroundColor Green
            }
        }
    } else {
        Write-Host "    ERROR: No CSS files found!" -ForegroundColor Red
        exit 1
    }
}

# Upload SVG files if they exist
Write-Host "  Uploading SVG..." -ForegroundColor Gray
$svgFiles = Get-ChildItem -Path $distDir -Filter "*.svg" -ErrorAction SilentlyContinue
if ($svgFiles) {
    foreach ($file in $svgFiles) {
        Write-Host "    Uploading $($file.Name)..." -ForegroundColor DarkGray
        $result = gsutil cp -h "Content-Type:image/svg+xml" $file.FullName "gs://$BUCKET_NAME/$($file.Name)" 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Host "    ERROR uploading $($file.Name): $result" -ForegroundColor Red
        }
    }
}

Write-Host "[OK] Files uploaded with Content-Type headers" -ForegroundColor Green
Write-Host ""

# Step 4: Set permissions
Write-Host "Step 4: Setting permissions..." -ForegroundColor Yellow
gsutil iam ch allUsers:objectViewer "gs://$BUCKET_NAME" 2>&1 | Out-Null
gsutil web set -m index.html -e index.html "gs://$BUCKET_NAME" 2>&1 | Out-Null
Write-Host "[OK] Permissions configured" -ForegroundColor Green
Write-Host ""

# Step 5: Verify
Write-Host "Step 5: Verifying upload..." -ForegroundColor Yellow
$uploadedFiles = gsutil ls -r "gs://$BUCKET_NAME" 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] Files verified:" -ForegroundColor Green
    $uploadedFiles | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
    
    # Check Content-Type of JS file
    $jsFile = $uploadedFiles | Where-Object { $_ -like "*.js" } | Select-Object -First 1
    if ($jsFile) {
        Write-Host ""
        Write-Host "Checking Content-Type of JS file..." -ForegroundColor Gray
        $metadata = gsutil stat $jsFile 2>&1
        if ($metadata -match "Content-Type:\s*application/javascript") {
            Write-Host "[OK] JS file has correct Content-Type" -ForegroundColor Green
        } else {
            Write-Host "[WARN] JS file Content-Type might be wrong" -ForegroundColor Yellow
            Write-Host "Metadata: $metadata" -ForegroundColor Gray
        }
    }
} else {
    Write-Host "WARNING: Could not verify files" -ForegroundColor Yellow
}
Write-Host ""

# Step 6: Display test URLs
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Deployment Complete!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Frontend URL:" -ForegroundColor Cyan
Write-Host "  https://storage.googleapis.com/$BUCKET_NAME/index.html" -ForegroundColor White
Write-Host ""
Write-Host "IMPORTANT: Clear your browser cache!" -ForegroundColor Yellow
Write-Host "  - Press Ctrl+Shift+Delete" -ForegroundColor Gray
Write-Host "  - Or use Incognito/Private mode" -ForegroundColor Gray
Write-Host ""
Write-Host "Test these URLs directly:" -ForegroundColor Cyan
$jsFiles = Get-ChildItem -Path $assetsDir -Filter "*.js" -ErrorAction SilentlyContinue
$cssFiles = Get-ChildItem -Path $assetsDir -Filter "*.css" -ErrorAction SilentlyContinue
if ($jsFiles) {
    Write-Host "  JS: https://storage.googleapis.com/$BUCKET_NAME/assets/$($jsFiles[0].Name)" -ForegroundColor White
}
if ($cssFiles) {
    Write-Host "  CSS: https://storage.googleapis.com/$BUCKET_NAME/assets/$($cssFiles[0].Name)" -ForegroundColor White
}
Write-Host ""
