# Test Upload Endpoints on GCP (Cloud Run)
# Run from project root. Set $BackendUrl if your backend URL differs.

param(
    [string]$BackendUrl = "https://tat-backend-vzkn2vygsa-uc.a.run.app",
    [string]$StrategyId = ""  # Optional: pass a real strategy UUID for product-equivalents test
)

$ErrorActionPreference = "Stop"

Write-Host "=== Upload Endpoint Tests (GCP) ===" -ForegroundColor Cyan
Write-Host "Backend: $BackendUrl" -ForegroundColor Gray
Write-Host ""

$corsHeaders = @{
    "Origin" = "https://storage.googleapis.com"
    "Access-Control-Request-Method" = "POST"
    "Access-Control-Request-Headers" = "content-type"
}

# 1. Health check
Write-Host "1. Health check..." -ForegroundColor Yellow
try {
    $r = Invoke-RestMethod -Uri "$BackendUrl/api/health" -Method GET
    Write-Host "   [OK] $($r | ConvertTo-Json -Compress)" -ForegroundColor Green
} catch {
    Write-Host "   [FAIL] $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# 2. OPTIONS preflight - ingest
Write-Host "2. OPTIONS preflight (ingest)..." -ForegroundColor Yellow
try {
    $r = Invoke-WebRequest -Uri "$BackendUrl/api/monitoring/ingest" -Method OPTIONS -Headers $corsHeaders -UseBasicParsing
    $allowOrigin = $r.Headers["Access-Control-Allow-Origin"]
    if ($r.StatusCode -eq 200 -and $allowOrigin) {
        Write-Host "   [OK] Status=$($r.StatusCode) Allow-Origin=$allowOrigin" -ForegroundColor Green
    } else {
        Write-Host "   [WARN] Status=$($r.StatusCode) Allow-Origin=$allowOrigin" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   [FAIL] $($_.Exception.Message)" -ForegroundColor Red
}

# 3. OPTIONS preflight - product equivalents (use placeholder UUID)
Write-Host "3. OPTIONS preflight (product-equivalents)..." -ForegroundColor Yellow
$pePath = if ($StrategyId) { "/api/admin/product-equivalents/$StrategyId" } else { "/api/admin/product-equivalents/00000000-0000-0000-0000-000000000000" }
try {
    $r = Invoke-WebRequest -Uri "$BackendUrl$pePath" -Method OPTIONS -Headers $corsHeaders -UseBasicParsing
    $allowOrigin = $r.Headers["Access-Control-Allow-Origin"]
    if ($r.StatusCode -eq 200 -and $allowOrigin) {
        Write-Host "   [OK] Status=$($r.StatusCode) Allow-Origin=$allowOrigin" -ForegroundColor Green
    } else {
        Write-Host "   [WARN] Status=$($r.StatusCode) Allow-Origin=$allowOrigin" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   [FAIL] $($_.Exception.Message)" -ForegroundColor Red
}

# 4. POST ingest - minimal valid CSV
Write-Host "4. POST ingest (minimal CSV)..." -ForegroundColor Yellow
$ingestCsv = @"
Ticker,Market Val,Cash As Position,Account,Model,Advisor,Firm,Enterprise,As Of Date
WFMIX,1498.59,13532.47,****5038,Auour Instinct,Worthington,Cetera,Cetera,28-Jan-26
"@
try {
    $r = Invoke-RestMethod -Uri "$BackendUrl/api/monitoring/ingest?force=true" -Method POST -Body $ingestCsv -ContentType "text/csv; charset=utf-8" -Headers @{"Origin"="https://storage.googleapis.com"}
    Write-Host "   [OK] ingested_count=$($r.ingested_count) skipped=$($r.skipped_count)" -ForegroundColor Green
} catch {
    $status = $_.Exception.Response.StatusCode.value__
    $body = try { $_.ErrorDetails.Message } catch { "N/A" }
    Write-Host "   [FAIL] HTTP $status - $body" -ForegroundColor Red
}

# 5. POST product equivalents - only if StrategyId provided
if ($StrategyId) {
    Write-Host "5. POST product-equivalents..." -ForegroundColor Yellow
    $peCsv = @"
Ticker,Alternate
SPYM,LEG
"@
    try {
        $r = Invoke-RestMethod -Uri "$BackendUrl/api/admin/product-equivalents/$StrategyId" -Method POST -Body $peCsv -ContentType "text/csv; charset=utf-8" -Headers @{"Origin"="https://storage.googleapis.com"}
        Write-Host "   [OK] $($r.message) count=$($r.count)" -ForegroundColor Green
    } catch {
        $status = $_.Exception.Response.StatusCode.value__
        $body = try { $_.ErrorDetails.Message } catch { "N/A" }
        Write-Host "   [FAIL] HTTP $status - $body" -ForegroundColor Red
    }
} else {
    Write-Host "5. POST product-equivalents - SKIP (pass -StrategyId for real test)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Done. Check Cloud Run logs if any step failed:" -ForegroundColor Cyan
Write-Host "  gcloud run services logs read tat-backend --region=us-central1 --limit=50" -ForegroundColor Gray
