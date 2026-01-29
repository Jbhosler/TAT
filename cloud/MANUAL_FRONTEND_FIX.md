# Manual Frontend Fix - Step by Step

## Problem
Blank screen with no console output = JavaScript file isn't executing

## Solution

### Step 1: Verify Files Are Uploaded
```powershell
gsutil ls -r gs://tat-frontend-tax-aware-transition-tool/
```

You should see:
- `index.html`
- `assets/index-C5qaHCQf.js`
- `assets/index-C65_JmHT.css`

### Step 2: Fix Content-Type Headers (CRITICAL)

The JS file MUST have `Content-Type: application/javascript` or the browser won't execute it.

```powershell
# Fix HTML
gsutil setmeta -h "Content-Type:text/html; charset=utf-8" gs://tat-frontend-tax-aware-transition-tool/index.html

# Fix JavaScript (THIS IS CRITICAL)
gsutil setmeta -h "Content-Type:application/javascript; charset=utf-8" gs://tat-frontend-tax-aware-transition-tool/assets/index-C5qaHCQf.js

# Fix CSS
gsutil setmeta -h "Content-Type:text/css; charset=utf-8" gs://tat-frontend-tax-aware-transition-tool/assets/index-C65_JmHT.css
```

### Step 3: Verify Content-Type

Test the JS file directly in browser:
```
https://storage.googleapis.com/tat-frontend-tax-aware-transition-tool/assets/index-C5qaHCQf.js
```

**Expected:** You should see JavaScript code (minified)
**If you see:** Plain text or download prompt = Content-Type is wrong

### Step 4: Test in Browser

1. **Open Incognito/Private window** (bypasses cache)
2. Go to: `https://storage.googleapis.com/tat-frontend-tax-aware-transition-tool/index.html`
3. Open DevTools (F12) → Console tab
4. Check for errors

### Step 5: Check Browser Console

Look for:
- **404 errors** = Files not found (check paths)
- **CORS errors** = Backend CORS issue
- **Syntax errors** = JavaScript file corrupted
- **No errors but blank screen** = React not mounting (check console for React errors)

## Common Issues

### Issue: JS file shows as text/plain
**Fix:** Run Step 2 above to set Content-Type

### Issue: 404 for assets
**Fix:** Check if index.html uses `/assets/` (absolute) or `./assets/` (relative)
- If relative (`./assets/`), Cloud Storage might not resolve correctly
- Rebuild with `base: '/'` in vite.config.ts

### Issue: Blank screen, no console errors
**Possible causes:**
1. JavaScript file has wrong Content-Type → Fix with Step 2
2. React app failing silently → Check for React errors in console
3. Router issue → Check if URL path matches routes

## Quick Test

Run this to verify everything:

```powershell
# 1. Check files exist
gsutil ls -r gs://tat-frontend-tax-aware-transition-tool/

# 2. Check Content-Type of JS file
gsutil stat gs://tat-frontend-tax-aware-transition-tool/assets/index-C5qaHCQf.js | findstr Content-Type

# 3. Fix if wrong
gsutil setmeta -h "Content-Type:application/javascript; charset=utf-8" gs://tat-frontend-tax-aware-transition-tool/assets/index-C5qaHCQf.js
```

## If Still Not Working

1. **Test JS file directly:** Open `https://storage.googleapis.com/tat-frontend-tax-aware-transition-tool/assets/index-C5qaHCQf.js` in browser
   - Should show JavaScript code
   - If it downloads or shows as text = Content-Type wrong

2. **Check browser Network tab:**
   - Open DevTools → Network
   - Reload page
   - Check if JS file loads (status 200?)
   - Check Content-Type header in response

3. **Try absolute paths:**
   - Rebuild with `base: '/'` in vite.config.ts
   - Re-upload files
