# Set Cloud Run IAM Policy to Allow Unauthenticated Access
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Setting Cloud Run IAM Policy" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

$PROJECT_ID = "tax-aware-transition-tool"
$SERVICE_NAME = "tat-backend"
$REGION = "us-central1"

Write-Host "Setting IAM policy for: $SERVICE_NAME" -ForegroundColor Yellow
Write-Host "Region: $REGION" -ForegroundColor Gray
Write-Host ""

try {
    Write-Host "Granting 'allUsers' the 'Cloud Run Invoker' role..." -ForegroundColor Gray
    
    gcloud run services add-iam-policy-binding $SERVICE_NAME `
        --region=$REGION `
        --member="allUsers" `
        --role="roles/run.invoker" `
        --project=$PROJECT_ID
    
    Write-Host ""
    Write-Host "[OK] IAM policy updated successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "The service is now publicly accessible." -ForegroundColor Green
} catch {
    Write-Host ""
    Write-Host "[ERROR] Failed to set IAM policy" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "Alternative: Set via Cloud Console:" -ForegroundColor Yellow
    Write-Host "1. Go to: https://console.cloud.google.com/run/detail/$REGION/$SERVICE_NAME" -ForegroundColor Gray
    Write-Host "2. Click 'SHOW INFO PANEL' (top right)" -ForegroundColor Gray
    Write-Host "3. Click 'PERMISSIONS' tab" -ForegroundColor Gray
    Write-Host "4. Click 'GRANT ACCESS'" -ForegroundColor Gray
    Write-Host "5. Add principal: allUsers" -ForegroundColor Gray
    Write-Host "6. Role: Cloud Run Invoker" -ForegroundColor Gray
    Write-Host "7. Save" -ForegroundColor Gray
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
