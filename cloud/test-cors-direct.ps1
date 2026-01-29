# Test CORS Configuration Directly
$backendUrl = "https://tat-backend-vzkn2vygsa-uc.a.run.app"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Direct CORS Test" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Test 1: OPTIONS preflight request
Write-Host "Test 1: OPTIONS Preflight Request" -ForegroundColor Yellow
Write-Host "URL: $backendUrl/api/auth/validate" -ForegroundColor Gray
Write-Host ""

try {
    $headers = @{
        "Origin" = "https://storage.googleapis.com"
        "Access-Control-Request-Method" = "POST"
        "Access-Control-Request-Headers" = "content-type"
    }
    
    $response = Invoke-WebRequest -Uri "$backendUrl/api/auth/validate" -Method OPTIONS -Headers $headers -UseBasicParsing -ErrorAction Stop
    
    Write-Host "[OK] OPTIONS request succeeded" -ForegroundColor Green
    Write-Host "Status Code: $($response.StatusCode)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Response Headers:" -ForegroundColor Gray
    $response.Headers.GetEnumerator() | Where-Object { $_.Key -like "*access-control*" } | ForEach-Object {
        Write-Host "  $($_.Key): $($_.Value)" -ForegroundColor Gray
    }
    
    if ($response.Headers["Access-Control-Allow-Origin"]) {
        Write-Host ""
        Write-Host "[OK] CORS headers present!" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "[WARNING] No Access-Control-Allow-Origin header found" -ForegroundColor Red
    }
} catch {
    Write-Host "[ERROR] OPTIONS request failed" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        Write-Host "Status Code: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Test 2: Actual POST request
Write-Host "Test 2: POST Request (with CORS)" -ForegroundColor Yellow
Write-Host ""

try {
    $body = @{ passcode = "007" } | ConvertTo-Json
    $headers = @{
        "Origin" = "https://storage.googleapis.com"
        "Content-Type" = "application/json"
    }
    
    $response = Invoke-WebRequest -Uri "$backendUrl/api/auth/validate" -Method POST -Body $body -Headers $headers -ContentType "application/json" -UseBasicParsing -ErrorAction Stop
    
    Write-Host "[OK] POST request succeeded" -ForegroundColor Green
    Write-Host "Status Code: $($response.StatusCode)" -ForegroundColor Gray
    Write-Host "Response: $($response.Content)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "CORS Headers:" -ForegroundColor Gray
    $response.Headers.GetEnumerator() | Where-Object { $_.Key -like "*access-control*" } | ForEach-Object {
        Write-Host "  $($_.Key): $($_.Value)" -ForegroundColor Gray
    }
} catch {
    Write-Host "[ERROR] POST request failed" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        Write-Host "Status Code: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
        try {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $responseBody = $reader.ReadToEnd()
            Write-Host "Response Body: $responseBody" -ForegroundColor Red
        } catch {
            # Ignore stream reading errors
        }
    }
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Test Complete" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
