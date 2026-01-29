# Verify Bucket Contents

## Current Status
✅ HTML file is correct (shows `/assets/index-DQw-wOTl.js`)
❌ JS file returns 404: `/assets/index-DQw-wOTl.js`
❌ CSS file returns 404: `index-C65_JmHT.css` (missing `/assets/` prefix)

## Issue
The assets folder/files might not be uploaded to the bucket.

## Verification Steps

### Step 1: Check what's in the bucket
In Google Cloud Console:
1. Go to: https://console.cloud.google.com/storage/browser/tat-frontend-tax-aware-transition-tool
2. Look for:
   - `index.html` ✅ (exists)
   - `assets/` folder ❓ (check if this exists)
   - `assets/index-DQw-wOTl.js` ❓ (check if this exists)
   - `assets/index-C65_JmHT.css` ❓ (check if this exists)

### Step 2: Upload assets folder
If the `assets/` folder is missing or incomplete:

1. **In Cloud Console:**
   - Click "Upload Folder" or "Upload Files"
   - Navigate to: `C:\Users\JosephHosler\TAT\frontend\dist\assets`
   - Upload the entire `assets` folder
   - Or upload both files individually:
     - `index-DQw-wOTl.js`
     - `index-C65_JmHT.css`

2. **Set Content-Type for each file:**
   - `index-DQw-wOTl.js` → `application/javascript; charset=utf-8`
   - `index-C65_JmHT.css` → `text/css; charset=utf-8`

3. **Set permissions:**
   - Select both files
   - Click "Edit access"
   - Add: `allUsers` with role `Storage Object Viewer`

### Step 3: Verify file structure
After upload, the bucket should have:
```
tat-frontend-tax-aware-transition-tool/
├── index.html
└── assets/
    ├── index-DQw-wOTl.js
    └── index-C65_JmHT.css
```

### Step 4: Test direct URLs
After uploading, test these URLs directly:

1. **JS:** `https://storage.googleapis.com/tat-frontend-tax-aware-transition-tool/assets/index-DQw-wOTl.js`
   - Should show JavaScript code (200 OK)

2. **CSS:** `https://storage.googleapis.com/tat-frontend-tax-aware-transition-tool/assets/index-C65_JmHT.css`
   - Should show CSS code (200 OK)

## Quick Fix

If files are missing, upload them now:

1. **Upload assets folder:**
   - In Cloud Console, click "Upload Folder"
   - Select: `C:\Users\JosephHosler\TAT\frontend\dist\assets`
   - Upload

2. **Set Content-Types:**
   - Click on `index-DQw-wOTl.js` → Edit metadata → Content-Type: `application/javascript; charset=utf-8`
   - Click on `index-C65_JmHT.css` → Edit metadata → Content-Type: `text/css; charset=utf-8`

3. **Set permissions:**
   - Select both asset files
   - Permissions tab → Add `allUsers` → `Storage Object Viewer`

4. **Test:**
   - Open Incognito: `https://storage.googleapis.com/tat-frontend-tax-aware-transition-tool/index.html`
   - Should load without 404 errors
