# Test CORS Configuration
$backendUrl = "https://tat-backend-vzkn2vygsa-uc.a.run.app"

Write-Host "Testing CORS configuration..." -ForegroundColor Yellow
Write-Host ""

# Test OPTIONS preflight request
Write-Host "Testing OPTIONS preflight request..." -ForegroundColor Gray
$headers = @{
    "Origin" = "https://storage.googleapis.com"
    "Access-Control-Request-Method" = "POST"
    "Access-Control-Request-Headers" = "content-type"
}

try {
    $response = Invoke-WebRequest -Uri "$backendUrl/api/auth/validate" -Method OPTIONS -Headers $headers -UseBasicParsing
    Write-Host "[OK] OPTIONS request succeeded" -ForegroundColor Green
    Write-Host "Status: $($response.StatusCode)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "CORS Headers:" -ForegroundColor Gray
    $response.Headers | ForEach-Object {
        if ($_.Keys -like "*access-control*") {
            Write-Host "  $($_.Keys): $($_.Values)" -ForegroundColor Gray
        }
    }
} catch {
    Write-Host "[ERROR] OPTIONS request failed" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
}

Write-Host ""
Write-Host "Testing actual POST request..." -ForegroundColor Gray
try {
    $body = @{ passcode = "007" } | ConvertTo-Json
    $response = Invoke-WebRequest -Uri "$backendUrl/api/auth/validate" -Method POST -Body $body -ContentType "application/json" -Headers @{"Origin" = "https://storage.googleapis.com"} -UseBasicParsing
    Write-Host "[OK] POST request succeeded" -ForegroundColor Green
    Write-Host "Response: $($response.Content)" -ForegroundColor Gray
} catch {
    Write-Host "[ERROR] POST request failed" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
}
