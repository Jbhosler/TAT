# Fix Content-Type headers for frontend files in Cloud Storage
$BUCKET_NAME = "tat-frontend-tax-aware-transition-tool"

Write-Host "Setting correct Content-Type headers for frontend files..." -ForegroundColor Yellow

# Set Content-Type for HTML files
Write-Host "Setting HTML content types..." -ForegroundColor Gray
gsutil -m setmeta -h "Content-Type:text/html" "gs://$BUCKET_NAME/*.html" 2>&1 | Out-Null

# Set Content-Type for JavaScript files
Write-Host "Setting JavaScript content types..." -ForegroundColor Gray
gsutil -m setmeta -h "Content-Type:application/javascript" "gs://$BUCKET_NAME/assets/*.js" 2>&1 | Out-Null

# Set Content-Type for CSS files
Write-Host "Setting CSS content types..." -ForegroundColor Gray
gsutil -m setmeta -h "Content-Type:text/css" "gs://$BUCKET_NAME/assets/*.css" 2>&1 | Out-Null

# Set Content-Type for SVG files
Write-Host "Setting SVG content types..." -ForegroundColor Gray
gsutil -m setmeta -h "Content-Type:image/svg+xml" "gs://$BUCKET_NAME/*.svg" 2>&1 | Out-Null

Write-Host "[OK] Content-Type headers updated" -ForegroundColor Green
Write-Host "Try accessing: https://storage.googleapis.com/$BUCKET_NAME/index.html" -ForegroundColor Cyan
