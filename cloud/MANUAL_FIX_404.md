# Manual Fix for 404 Asset Errors

## Problem
CSS and JS files return 404 errors because `index.html` was using relative paths (`./assets/`) which Cloud Storage doesn't resolve correctly.

## Solution
I've already fixed `frontend/dist/index.html` to use absolute paths (`/assets/`). Now you need to upload it.

## Step-by-Step Fix

### Option 1: Use PowerShell Script (if gsutil works)

```powershell
cd C:\Users\JosephHosler\TAT
.\cloud\quick-fix-paths.ps1
```

### Option 2: Manual Upload Commands

If the script fails due to gsutil permissions, run these commands manually:

```powershell
# 1. Navigate to project root
cd C:\Users\JosephHosler\TAT

# 2. Upload the fixed index.html and assets
gsutil -m cp frontend\dist\index.html gs://tat-frontend-tax-aware-transition-tool/
gsutil -m cp -r frontend\dist\assets gs://tat-frontend-tax-aware-transition-tool/

# 3. Set Content-Type headers (CRITICAL)
gsutil setmeta -h "Content-Type:text/html; charset=utf-8" gs://tat-frontend-tax-aware-transition-tool/index.html
gsutil setmeta -h "Content-Type:application/javascript; charset=utf-8" gs://tat-frontend-tax-aware-transition-tool/assets/*.js
gsutil setmeta -h "Content-Type:text/css; charset=utf-8" gs://tat-frontend-tax-aware-transition-tool/assets/*.css

# 4. Set permissions
gsutil iam ch allUsers:objectViewer gs://tat-frontend-tax-aware-transition-tool
gsutil web set -m index.html -e index.html gs://tat-frontend-tax-aware-transition-tool
```

### Option 3: Verify Current State

First, check what's currently in the bucket:

```powershell
gsutil ls -r gs://tat-frontend-tax-aware-transition-tool/
```

Then check what `index.html` references:

```powershell
gsutil cat gs://tat-frontend-tax-aware-transition-tool/index.html
```

**Expected:** Should show `/assets/` (absolute paths)
**If it shows:** `./assets/` (relative paths) = needs to be fixed

## Verify the Fix

After uploading, test these URLs directly in your browser:

1. **HTML:** `https://storage.googleapis.com/tat-frontend-tax-aware-transition-tool/index.html`
   - Should show the HTML page

2. **JS:** `https://storage.googleapis.com/tat-frontend-tax-aware-transition-tool/assets/index-C5qaHCQf.js`
   - Should show JavaScript code (minified)
   - If it downloads or shows as text = Content-Type is wrong

3. **CSS:** `https://storage.googleapis.com/tat-frontend-tax-aware-transition-tool/assets/index-C65_JmHT.css`
   - Should show CSS code
   - If it downloads or shows as text = Content-Type is wrong

## Test in Browser

1. **Clear browser cache** (Ctrl+Shift+Delete) or use **Incognito/Private mode**
2. Go to: `https://storage.googleapis.com/tat-frontend-tax-aware-transition-tool/index.html`
3. Open DevTools (F12) → Console tab
4. Check for errors

**Expected:** No 404 errors, React app loads
**If still 404:** Check Network tab to see what URL is being requested

## What Changed

- **Before:** `src="./assets/index-C5qaHCQf.js"` (relative path)
- **After:** `src="/assets/index-C5qaHCQf.js"` (absolute path)

Absolute paths work correctly with Cloud Storage static website hosting.
