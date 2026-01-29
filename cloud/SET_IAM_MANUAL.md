# Set Cloud Run IAM Policy - Manual Instructions

## Problem
Cloud Run is returning 403 Forbidden because the service requires authentication. We need to allow unauthenticated access.

## Solution: Set IAM Policy

### Method 1: Via Cloud Console (Easiest)

1. **Go to Cloud Run Service:**
   - Open: https://console.cloud.google.com/run/detail/us-central1/tat-backend
   - Or navigate: Cloud Run → tat-backend → Click on service name

2. **Open Permissions Panel:**
   - Click the **"SHOW INFO PANEL"** button (top right, looks like `>_` or `i` icon)
   - OR look for **"PERMISSIONS"** tab in the top menu
   - OR click the **three dots menu** (⋮) → **"PERMISSIONS"**

3. **Grant Access:**
   - Click **"GRANT ACCESS"** or **"ADD PRINCIPAL"** button
   - In **"New principals"** field, enter: `allUsers`
   - In **"Select a role"** dropdown, choose: **"Cloud Run Invoker"**
   - Click **"SAVE"**

4. **Verify:**
   - You should see `allUsers` listed with role `Cloud Run Invoker`
   - Wait 1-2 minutes for changes to propagate

### Method 2: Via Command Line

Run this PowerShell script:
```powershell
.\cloud\set-iam-policy.ps1
```

Or run directly:
```powershell
gcloud run services add-iam-policy-binding tat-backend --region=us-central1 --member=allUsers --role=roles/run.invoker
```

### Method 3: Via IAM & Admin Console

1. Go to: https://console.cloud.google.com/iam-admin/iam?project=tax-aware-transition-tool
2. Use the filter/search to find `tat-backend`
3. Or go directly to Cloud Run service and use the permissions panel

## Verification

After setting the policy, test with:
```powershell
.\cloud\test-cors-direct.ps1
```

Or test in browser:
- Open: https://storage.googleapis.com/tat-frontend-tax-aware-transition-tool/index.html
- Enter passcode: `007`
- Should work without CORS errors

## Troubleshooting

If you still see 403 errors:
1. Wait 2-3 minutes for IAM changes to propagate
2. Clear browser cache
3. Check Cloud Run logs to confirm requests are reaching the app
4. Verify the IAM policy was set correctly:
   ```powershell
   gcloud run services get-iam-policy tat-backend --region=us-central1
   ```
