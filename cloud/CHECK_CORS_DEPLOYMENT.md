# Check CORS Deployment Status

## Issue
CORS preflight OPTIONS request is failing even after deployment.

## Possible Causes

1. **Deployment not fully propagated** - Cloud Run can take 1-2 minutes to fully roll out
2. **Old code still running** - Previous revision might still be active
3. **CORS middleware order** - Middleware might need to be configured differently

## Step 1: Verify New Deployment is Active

In Google Cloud Console:
1. Go to: https://console.cloud.google.com/run/detail/us-central1/tat-backend
2. Check the **"Revisions"** tab
3. Look for the latest revision (should be recent, within last few minutes)
4. Verify it's marked as **"100%"** traffic

## Step 2: Check Backend Logs

1. Go to: https://console.cloud.google.com/run/detail/us-central1/tat-backend/logs
2. Look for recent log entries
3. Check if you see CORS-related errors or if requests are coming through

## Step 3: Test CORS Headers Directly

Open browser console and run:

```javascript
// Test OPTIONS preflight
fetch('https://tat-backend-vzkn2vygsa-uc.a.run.app/api/auth/validate', {
  method: 'OPTIONS',
  headers: {
    'Origin': 'https://storage.googleapis.com',
    'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'content-type'
  }
}).then(r => {
  console.log('OPTIONS Status:', r.status);
  console.log('CORS Headers:', {
    'allow-origin': r.headers.get('access-control-allow-origin'),
    'allow-methods': r.headers.get('access-control-allow-methods'),
    'allow-headers': r.headers.get('access-control-allow-headers')
  });
}).catch(e => console.error('OPTIONS Error:', e));
```

## Step 4: If Still Failing - Wait and Retry

Cloud Run deployments can take 1-2 minutes to fully propagate. Try:
1. Wait 2 minutes
2. Clear browser cache
3. Test again in Incognito

## Alternative: Check if Backend is Actually Running New Code

The CORS config should work. If it's still failing after 2-3 minutes, the issue might be:
- Backend crashed and rolled back to old version
- Cloud Run caching issue
- Need to explicitly restart the service

## Quick Fix: Force New Revision

If needed, you can force a new revision:

```powershell
gcloud run services update tat-backend --region=us-central1 --no-traffic
gcloud run services update tat-backend --region=us-central1 --to-latest
```

This forces Cloud Run to create a fresh revision with the new code.
