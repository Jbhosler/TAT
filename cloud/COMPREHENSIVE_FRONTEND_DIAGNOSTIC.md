# Comprehensive Frontend Diagnostic Plan

## Problem Statement
- Browser requests old JS file (`index-C5qaHCQf.js`) but HTML references new file (`index-DQw-wOTl.js`)
- CSS file (`index-C65_JmHT.css`) returns 404
- This indicates a hash mismatch and/or upload issue

## Root Cause Analysis

### Issue 1: Hash Mismatch After Rebuild
**Symptom:** HTML references `index-DQw-wOTl.js` but browser requests `index-C5qaHCQf.js`
**Cause:** Browser cached old HTML, or new JS file not uploaded
**Solution:** Clear cache + ensure new files uploaded

### Issue 2: CSS File 404
**Symptom:** `index-C65_JmHT.css` returns 404
**Cause:** File not uploaded, wrong path, or Content-Type issue
**Solution:** Verify file exists in bucket, check path, verify Content-Type

## Diagnostic Steps

### Step 1: Verify Local Build Output
```powershell
cd C:\Users\JosephHosler\TAT\frontend
npm run build

# Check what files were generated
dir dist\assets
type dist\index.html
```

**Expected:**
- `dist/index.html` references `index-DQw-wOTl.js` (or current hash)
- `dist/assets/index-DQw-wOTl.js` exists
- `dist/assets/index-[hash].css` exists

### Step 2: Verify Cloud Storage Contents
```powershell
# List all files in bucket
gsutil ls -r gs://tat-frontend-tax-aware-transition-tool/

# Check specific files
gsutil ls gs://tat-frontend-tax-aware-transition-tool/assets/
```

**Expected:**
- Files in bucket match files in `dist/` folder
- JS file hash matches HTML reference
- CSS file exists

**If mismatch:** Files not uploaded correctly

### Step 3: Check HTML File in Bucket
```powershell
# View HTML file in bucket
gsutil cat gs://tat-frontend-tax-aware-transition-tool/index.html
```

**Check:**
- Does it reference `index-DQw-wOTl.js` or `index-C5qaHCQf.js`?
- Are paths absolute (`/assets/`) or relative (`./assets/`)?

### Step 4: Verify File URLs Directly
Test these URLs in browser:

1. **Current HTML:** `https://storage.googleapis.com/tat-frontend-tax-aware-transition-tool/index.html`
   - View source - what JS file does it reference?

2. **Old JS (if exists):** `https://storage.googleapis.com/tat-frontend-tax-aware-transition-tool/assets/index-C5qaHCQf.js`
   - Should return 404 if not uploaded

3. **New JS:** `https://storage.googleapis.com/tat-frontend-tax-aware-transition-tool/assets/index-DQw-wOTl.js`
   - Should return JavaScript code

4. **CSS:** `https://storage.googleapis.com/tat-frontend-tax-aware-transition-tool/assets/index-C65_JmHT.css`
   - Should return CSS code

## Solution Plan

### Phase 1: Complete Clean Upload
```powershell
cd C:\Users\JosephHosler\TAT

# 1. Rebuild fresh
cd frontend
npm run build
cd ..

# 2. Clear bucket completely
gsutil -m rm -r gs://tat-frontend-tax-aware-transition-tool/**

# 3. Upload everything fresh
gsutil -m cp -r frontend\dist\* gs://tat-frontend-tax-aware-transition-tool/

# 4. Set Content-Type headers
gsutil -m setmeta -h "Content-Type:text/html; charset=utf-8" gs://tat-frontend-tax-aware-transition-tool/*.html
gsutil -m setmeta -h "Content-Type:application/javascript; charset=utf-8" gs://tat-frontend-tax-aware-transition-tool/assets/*.js
gsutil -m setmeta -h "Content-Type:text/css; charset=utf-8" gs://tat-frontend-tax-aware-transition-tool/assets/*.css

# 5. Set permissions
gsutil iam ch allUsers:objectViewer gs://tat-frontend-tax-aware-transition-tool
gsutil web set -m index.html -e index.html gs://tat-frontend-tax-aware-transition-tool

# 6. Verify
gsutil ls -r gs://tat-frontend-tax-aware-transition-tool/
```

### Phase 2: Browser Cache Clear
1. **Hard Refresh:** Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
2. **Clear Cache:** Ctrl+Shift+Delete → Clear cached images and files
3. **Incognito Mode:** Test in private/incognito window
4. **DevTools:** Open DevTools → Network tab → Check "Disable cache"

### Phase 3: Verify Fix
1. Open `https://storage.googleapis.com/tat-frontend-tax-aware-transition-tool/index.html` in Incognito
2. Open DevTools → Network tab
3. Reload page
4. Check:
   - All requests return 200 (not 404)
   - JS file name matches HTML reference
   - CSS file loads
   - React app renders

## Common Issues & Fixes

### Issue: Browser Still Requests Old Hash
**Fix:** 
- Clear browser cache completely
- Use Incognito mode
- Check if HTML file in bucket has old hash (re-upload)

### Issue: Files Uploaded But Wrong Paths
**Fix:**
- Verify `index.html` uses absolute paths (`/assets/`)
- If relative paths (`./assets/`), fix `vite.config.ts` base path

### Issue: Content-Type Wrong
**Fix:**
- Run Content-Type fix commands
- Verify with `gsutil stat` on each file

### Issue: Permissions Denied
**Fix:**
- Run `gsutil iam ch allUsers:objectViewer` command
- Verify with `gsutil iam get`

## Automated Fix Script

See `cloud/complete-frontend-fix.ps1` for automated execution of all steps.

## Success Criteria

✅ All files uploaded to bucket
✅ HTML references match actual file names
✅ All requests return 200 status
✅ Content-Type headers correct
✅ React app renders (not blank page)
✅ No console errors
