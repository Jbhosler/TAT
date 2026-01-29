# Manual migration instructions
# Due to IPv6 connectivity issues with gcloud sql connect, use one of these methods:

$ErrorActionPreference = "Stop"
$PROJECT_ID = "tax-aware-transition-tool"
$INSTANCE_NAME = "tat-db-instance"
$DATABASE_NAME = "tat_database"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Database Migration - Manual Method" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Due to IPv6 connectivity issues, please use one of these methods:" -ForegroundColor Yellow
Write-Host ""

Write-Host "OPTION 1: Cloud Console SQL Editor (Easiest)" -ForegroundColor Green
Write-Host "1. Go to: https://console.cloud.google.com/sql/instances/$INSTANCE_NAME/databases" -ForegroundColor White
Write-Host "2. Click on '$DATABASE_NAME' database" -ForegroundColor White
Write-Host "3. Click 'Open Cloud Shell' or use the SQL Editor" -ForegroundColor White
Write-Host "4. Copy and paste the contents of cloud/init-db.sql" -ForegroundColor White
Write-Host "5. Execute the SQL" -ForegroundColor White
Write-Host ""

Write-Host "OPTION 2: Use Cloud SQL Proxy + psql" -ForegroundColor Green
Write-Host "1. Download Cloud SQL Proxy: https://cloud.google.com/sql/docs/postgres/sql-proxy" -ForegroundColor White
Write-Host "2. Run: cloud-sql-proxy $PROJECT_ID:us-central1:$INSTANCE_NAME" -ForegroundColor White
Write-Host "3. In another terminal: psql -h 127.0.0.1 -U postgres -d $DATABASE_NAME -f cloud/init-db.sql" -ForegroundColor White
Write-Host ""

Write-Host "OPTION 3: Try beta command (may work)" -ForegroundColor Green
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$initDbPath = Join-Path $scriptDir "init-db.sql"
if (Test-Path $initDbPath) {
    Write-Host "Attempting beta command..." -ForegroundColor Yellow
    Get-Content $initDbPath | gcloud beta sql connect $INSTANCE_NAME --user=postgres --database=$DATABASE_NAME
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[OK] Migrations complete!" -ForegroundColor Green
    } else {
        Write-Host "Beta command also failed. Please use Option 1 or 2 above." -ForegroundColor Red
    }
} else {
    Write-Host "SQL file not found at: $initDbPath" -ForegroundColor Red
}

Write-Host ""
Write-Host "SQL file location: $initDbPath" -ForegroundColor Cyan
Write-Host ""
