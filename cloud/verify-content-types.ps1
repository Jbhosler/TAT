# Verify and fix Content-Type headers
$BUCKET_NAME = "tat-frontend-tax-aware-transition-tool"

Write-Host "Checking Content-Type headers..." -ForegroundColor Yellow
Write-Host ""

# Check HTML
Write-Host "Checking index.html..." -ForegroundColor Gray
$htmlMeta = & gsutil stat "gs://$BUCKET_NAME/index.html" 2>&1
if ($htmlMeta -match "Content-Type:\s*([^\r\n]+)") {
    $ct = $matches[1].Trim()
    Write-Host "  Content-Type: $ct" -ForegroundColor $(if ($ct -like "*text/html*") { "Green" } else { "Yellow" })
} else {
    Write-Host "  Could not read Content-Type" -ForegroundColor Yellow
}

# Check JS
Write-Host ""
Write-Host "Checking JavaScript file..." -ForegroundColor Gray
$jsFiles = & gsutil ls "gs://$BUCKET_NAME/assets/*.js" 2>&1
if ($jsFiles) {
    $jsFile = ($jsFiles | Select-Object -First 1).Trim()
    $jsMeta = & gsutil stat $jsFile 2>&1
    if ($jsMeta -match "Content-Type:\s*([^\r\n]+)") {
        $ct = $matches[1].Trim()
        Write-Host "  Content-Type: $ct" -ForegroundColor $(if ($ct -like "*javascript*" -or $ct -like "*text/javascript*") { "Green" } else { "Yellow" })
        if ($ct -notlike "*javascript*") {
            Write-Host "  Fixing Content-Type..." -ForegroundColor Yellow
            & gsutil setmeta -h "Content-Type:application/javascript; charset=utf-8" $jsFile 2>&1 | Out-Null
            Write-Host "  [OK] Fixed" -ForegroundColor Green
        }
    }
}

# Check CSS
Write-Host ""
Write-Host "Checking CSS file..." -ForegroundColor Gray
$cssFiles = & gsutil ls "gs://$BUCKET_NAME/assets/*.css" 2>&1
if ($cssFiles) {
    $cssFile = ($cssFiles | Select-Object -First 1).Trim()
    $cssMeta = & gsutil stat $cssFile 2>&1
    if ($cssMeta -match "Content-Type:\s*([^\r\n]+)") {
        $ct = $matches[1].Trim()
        Write-Host "  Content-Type: $ct" -ForegroundColor $(if ($ct -like "*text/css*") { "Green" } else { "Yellow" })
        if ($ct -notlike "*text/css*") {
            Write-Host "  Fixing Content-Type..." -ForegroundColor Yellow
            & gsutil setmeta -h "Content-Type:text/css; charset=utf-8" $cssFile 2>&1 | Out-Null
            Write-Host "  [OK] Fixed" -ForegroundColor Green
        }
    }
}

Write-Host ""
Write-Host "Done!" -ForegroundColor Green
