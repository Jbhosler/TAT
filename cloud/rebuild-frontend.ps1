# Rebuild and upload frontend
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Rebuilding Frontend" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

$frontendDir = "C:\Users\JosephHosler\TAT\frontend"
$distDir = "$frontendDir\dist"
$bucketName = "tat-frontend-tax-aware-transition-tool"

# Change to frontend directory
Set-Location $frontendDir

Write-Host "Building frontend..." -ForegroundColor Yellow
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Build failed!" -ForegroundColor Red
    Write-Host "Please run 'npm run build' manually in the frontend directory" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "[OK] Build successful!" -ForegroundColor Green
Write-Host ""

# Upload to Cloud Storage
Write-Host "Uploading to Cloud Storage..." -ForegroundColor Yellow
Set-Location "C:\Users\JosephHosler\TAT"

gsutil -m rsync -r -d "$distDir" "gs://$bucketName"

Write-Host ""
Write-Host "Setting Content-Type headers..." -ForegroundColor Yellow
gsutil -m setmeta -h "Content-Type:text/html; charset=utf-8" "gs://$bucketName/index.html"
gsutil -m setmeta -h "Content-Type:text/javascript" "gs://$bucketName/assets/*.js"
gsutil -m setmeta -h "Content-Type:text/css" "gs://$bucketName/assets/*.css"

Write-Host ""
Write-Host "[OK] Frontend deployed!" -ForegroundColor Green
Write-Host ""
Write-Host "Frontend URL: https://storage.googleapis.com/$bucketName/index.html" -ForegroundColor Cyan
Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
