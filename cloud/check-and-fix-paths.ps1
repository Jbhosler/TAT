# Check HTML file in bucket and fix paths if needed
$BUCKET_NAME = "tat-frontend-tax-aware-transition-tool"
$PROJECT_ROOT = Split-Path -Parent $PSScriptRoot
$distDir = Join-Path $PROJECT_ROOT "frontend\dist"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Check and Fix Paths" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check what's in the bucket
Write-Host "Step 1: Checking HTML file in bucket..." -ForegroundColor Yellow
$bucketHTML = & gsutil cat "gs://$BUCKET_NAME/index.html" 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "HTML file in bucket:" -ForegroundColor Gray
    Write-Host $bucketHTML -ForegroundColor Gray
    Write-Host ""
    
    # Check paths
    if ($bucketHTML -match 'src="([^"]+\.js)"') {
        $jsPath = $matches[1]
        Write-Host "JS path in bucket: $jsPath" -ForegroundColor Yellow
        
        if ($jsPath -notmatch "^/tat-frontend-tax-aware-transition-tool/") {
            Write-Host "[ERROR] Path is missing bucket name!" -ForegroundColor Red
            Write-Host "Expected: /tat-frontend-tax-aware-transition-tool/assets/..." -ForegroundColor Gray
            Write-Host "Found: $jsPath" -ForegroundColor Gray
        } else {
            Write-Host "[OK] Path includes bucket name" -ForegroundColor Green
        }
    }
    
    if ($bucketHTML -match 'href="([^"]+\.css)"') {
        $cssPath = $matches[1]
        Write-Host "CSS path in bucket: $cssPath" -ForegroundColor Yellow
        
        if ($cssPath -notmatch "^/tat-frontend-tax-aware-transition-tool/") {
            Write-Host "[ERROR] Path is missing bucket name!" -ForegroundColor Red
            Write-Host "Expected: /tat-frontend-tax-aware-transition-tool/assets/..." -ForegroundColor Gray
            Write-Host "Found: $cssPath" -ForegroundColor Gray
        } else {
            Write-Host "[OK] Path includes bucket name" -ForegroundColor Green
        }
    }
} else {
    Write-Host "[ERROR] Could not read HTML from bucket" -ForegroundColor Red
}
Write-Host ""

# Step 2: Check local HTML file
Write-Host "Step 2: Checking local HTML file..." -ForegroundColor Yellow
$localHTMLFile = Join-Path $distDir "index.html"
if (Test-Path $localHTMLFile) {
    $localHTML = Get-Content $localHTMLFile -Raw
    Write-Host "Local HTML references:" -ForegroundColor Gray
    if ($localHTML -match 'src="([^"]+\.js)"') {
        Write-Host "  JS: $($matches[1])" -ForegroundColor Gray
    }
    if ($localHTML -match 'href="([^"]+\.css)"') {
        Write-Host "  CSS: $($matches[1])" -ForegroundColor Gray
    }
} else {
    Write-Host "[ERROR] Local HTML file not found!" -ForegroundColor Red
}
Write-Host ""

# Step 3: The issue is that Cloud Storage serves files from the bucket root
# So /assets/ resolves correctly when HTML is at /index.html
# But the browser is seeing /assets/ as absolute from storage.googleapis.com root
# This suggests the HTML might be cached or the bucket isn't configured correctly

Write-Host "Step 3: Diagnosis..." -ForegroundColor Yellow
Write-Host "The browser is requesting:" -ForegroundColor Gray
Write-Host "  https://storage.googleapis.com/assets/..." -ForegroundColor Red
Write-Host ""
Write-Host "But should request:" -ForegroundColor Gray
Write-Host "  https://storage.googleapis.com/$BUCKET_NAME/assets/..." -ForegroundColor Green
Write-Host ""
Write-Host "This means the HTML file paths are wrong or cached incorrectly." -ForegroundColor Yellow
Write-Host ""

# Step 4: Fix by ensuring HTML uses correct paths
Write-Host "Step 4: Fixing local HTML if needed..." -ForegroundColor Yellow
if (Test-Path $localHTMLFile) {
    $localHTML = Get-Content $localHTMLFile -Raw
    $needsFix = $false
    
    # Check if paths need bucket name prefix
    # Actually, for Cloud Storage, /assets/ should work if HTML is at root
    # The issue might be browser cache or the HTML wasn't uploaded correctly
    
    Write-Host "Re-uploading HTML file to ensure it's correct..." -ForegroundColor Gray
    & gsutil cp "$localHTMLFile" "gs://$BUCKET_NAME/index.html" 2>&1 | Out-Host
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[OK] HTML file re-uploaded" -ForegroundColor Green
    } else {
        Write-Host "[ERROR] Failed to re-upload HTML" -ForegroundColor Red
    }
}
Write-Host ""

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Check Complete" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next: Test in Incognito mode with cache disabled" -ForegroundColor Yellow
Write-Host ""
