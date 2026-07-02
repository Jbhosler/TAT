# Sync frontend dist/ to all production GCS buckets.
# tat.auourinvest.com DNS (CNAME -> c.storage.googleapis.com) serves gs://tat.auourinvest.com/
# Deploy scripts also use gs://tat-frontend-tax-aware-transition-tool/ (storage.googleapis.com URL + LB backend).

param(
    [Parameter(Mandatory = $true)]
    [string]$DistDir
)

$ErrorActionPreference = "Stop"

$FRONTEND_BUCKETS = @(
    "tat-frontend-tax-aware-transition-tool",
    "tat.auourinvest.com"
)

function Set-BucketWebAssets {
    param([string]$Bucket)
    $ErrorActionPreference = "Continue"
    gsutil -m setmeta -h "Content-Type:text/html" -h "Cache-Control:no-cache, no-store, must-revalidate" "gs://$Bucket/*.html" 2>&1 | Out-Null
    gsutil -m setmeta -h "Content-Type:application/javascript" "gs://$Bucket/assets/*.js" 2>&1 | Out-Null
    gsutil -m setmeta -h "Content-Type:text/css" "gs://$Bucket/assets/*.css" 2>&1 | Out-Null
    gsutil iam ch allUsers:objectViewer "gs://$Bucket" 2>&1 | Out-Null
    gsutil web set -m index.html -e index.html "gs://$Bucket" 2>&1 | Out-Null
}

foreach ($bucket in $FRONTEND_BUCKETS) {
    Write-Host "Syncing to gs://$bucket ..." -ForegroundColor Yellow
    $exists = gsutil ls -b "gs://$bucket" 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Bucket missing, skipping: $bucket" -ForegroundColor Red
        continue
    }
    gsutil -m rsync -r -d $DistDir "gs://$bucket"
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    Set-BucketWebAssets -Bucket $bucket
    Write-Host "  [OK] gs://$bucket" -ForegroundColor Green
}

# CDN in front of tat-frontend bucket (when DNS uses load balancer IP)
$ErrorActionPreference = "Continue"
gcloud compute url-maps invalidate-cdn-cache auour-lb --path "/*" --async 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) {
    Write-Host "CDN cache invalidation requested for auour-lb (async)." -ForegroundColor Gray
}
