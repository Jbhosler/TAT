# Frontend Blank Screen Diagnostic Plan

## Problem Summary
Frontend shows blank screen with 404 errors for assets:
- `/assets/index-C5qaHCQf.js` - 404
- `/assets/index-C65_JmHT.css` - 404
- `/vite.svg` - 404

## Architecture Explanation: Cloud Storage vs Cloud Run

### Why Frontend is in Cloud Storage (Current Approach)

**Advantages:**
1. **Cost-Effective**: Cloud Storage is much cheaper than Cloud Run for static files
   - Cloud Storage: ~$0.020 per GB/month
   - Cloud Run: Charges per request + compute time
2. **Performance**: Static files are served directly from CDN edge locations
3. **Simplicity**: No containerization needed for static assets
4. **Scalability**: Automatically handles high traffic without scaling concerns
5. **Standard Practice**: React/Vue/Angular SPAs are typically served as static files

**Disadvantages:**
1. **Path Resolution Issues**: Cloud Storage doesn't handle SPA routing well
2. **Content-Type Headers**: Must be manually configured
3. **No Server-Side Rendering**: Can't do SSR without a server
4. **404 Handling**: Need Cloud CDN/Load Balancer for proper SPA routing

### Why Backend is in Cloud Run

**Reasons:**
1. **Dynamic Content**: Needs to process requests, connect to database, run calculations
2. **Runtime Environment**: Requires Python runtime, dependencies, environment variables
3. **Stateful Operations**: Database connections, session management
4. **API Endpoints**: RESTful API needs request/response handling

**Could Frontend Be in Cloud Run?**
Yes, but it's overkill:
- Would require Docker containerization
- Higher cost for serving static files
- More complex deployment
- Only makes sense if you need SSR or server-side features

## Diagnostic Steps

### Step 1: Verify Files Are Uploaded

```powershell
# List all files in the bucket
gsutil ls -r gs://tat-frontend-tax-aware-transition-tool/

# Check specific asset files exist
gsutil ls gs://tat-frontend-tax-aware-transition-tool/assets/
```

**Expected Output:**
- `index.html` in root
- `assets/index-C5qaHCQf.js`
- `assets/index-C65_JmHT.css`
- `vite.svg` (if exists)

**If files are missing:**
- Rebuild: `cd frontend && npm run build`
- Re-upload: `gsutil -m rsync -r frontend/dist gs://tat-frontend-tax-aware-transition-tool`

### Step 2: Check Content-Type Headers

```powershell
# Check metadata for HTML file
gsutil stat gs://tat-frontend-tax-aware-transition-tool/index.html

# Check metadata for JS file
gsutil stat gs://tat-frontend-tax-aware-transition-tool/assets/index-C5qaHCQf.js

# Check metadata for CSS file
gsutil stat gs://tat-frontend-tax-aware-transition-tool/assets/index-C65_JmHT.css
```

**Expected Content-Types:**
- HTML: `text/html`
- JS: `application/javascript` or `text/javascript`
- CSS: `text/css`

**If wrong Content-Type:**
```powershell
# Fix Content-Type headers
gsutil -m setmeta -h "Content-Type:text/html" "gs://tat-frontend-tax-aware-transition-tool/*.html"
gsutil -m setmeta -h "Content-Type:application/javascript" "gs://tat-frontend-tax-aware-transition-tool/assets/*.js"
gsutil -m setmeta -h "Content-Type:text/css" "gs://tat-frontend-tax-aware-transition-tool/assets/*.css"
```

### Step 3: Verify Public Access

```powershell
# Check bucket IAM policy
gsutil iam get gs://tat-frontend-tax-aware-transition-tool

# Ensure public read access
gsutil iam ch allUsers:objectViewer gs://tat-frontend-tax-aware-transition-tool
```

**Expected:**
- `allUsers` should have `objectViewer` role

### Step 4: Test Direct Asset Access

Try accessing assets directly in browser:

1. **HTML**: `https://storage.googleapis.com/tat-frontend-tax-aware-transition-tool/index.html`
2. **JS**: `https://storage.googleapis.com/tat-frontend-tax-aware-transition-tool/assets/index-C5qaHCQf.js`
3. **CSS**: `https://storage.googleapis.com/tat-frontend-tax-aware-transition-tool/assets/index-C65_JmHT.css`

**If JS/CSS return 404:**
- Files weren't uploaded correctly
- Path mismatch between HTML references and actual files
- Need to rebuild and re-upload

**If JS/CSS return wrong Content-Type:**
- Browser won't execute JS or apply CSS
- Fix Content-Type headers (see Step 2)

### Step 5: Check Browser Console

Open browser DevTools (F12) and check:

1. **Network Tab:**
   - Are requests being made?
   - What status codes?
   - What Content-Type headers are returned?

2. **Console Tab:**
   - Any JavaScript errors?
   - CORS errors?
   - Module loading errors?

3. **Application Tab:**
   - Is `index.html` loaded?
   - Is React mounting?

### Step 6: Verify Build Output

```powershell
cd frontend
npm run build

# Check dist folder structure
ls -R dist/

# Verify index.html references match actual files
cat dist/index.html
```

**Expected Structure:**
```
dist/
├── index.html
├── assets/
│   ├── index-[hash].js
│   └── index-[hash].css
└── vite.svg (optional)
```

**If hash mismatch:**
- HTML references old hashed filenames
- Need to rebuild and re-upload everything together

### Step 7: Check Vite Configuration

Verify `frontend/vite.config.ts`:

```typescript
export default defineConfig({
  base: '/',  // Should be '/' for Cloud Storage root
  build: {
    assetsDir: 'assets',  // Should match actual folder name
  },
})
```

**If base is wrong:**
- Assets will be requested from wrong path
- Update `base` and rebuild

### Step 8: Test Local Build

```powershell
cd frontend
npm run build
npx serve dist
```

Open `http://localhost:3000` - does it work locally?

**If local works but Cloud Storage doesn't:**
- Upload issue or Content-Type problem
- Focus on Steps 1-4

**If local also fails:**
- Build configuration issue
- Check Step 6-7

## Common Issues & Solutions

### Issue 1: Assets Not Uploaded
**Symptom:** 404 errors for all assets
**Solution:** 
```powershell
cd frontend
npm run build
gsutil -m rsync -r frontend/dist gs://tat-frontend-tax-aware-transition-tool
```

### Issue 2: Wrong Content-Type
**Symptom:** Assets load but don't execute/apply
**Solution:** Run `cloud/fix-frontend-content-types.ps1`

### Issue 3: Path Mismatch
**Symptom:** HTML references `/assets/file.js` but file is at `/assets/file.js`
**Solution:** Check `vite.config.ts` base path, rebuild

### Issue 4: CORS Errors
**Symptom:** API calls fail with CORS errors
**Solution:** Backend CORS already allows `*`, but verify:
```python
# backend/api/main.py
allow_origins=["*"]  # Should include Cloud Storage domain
```

### Issue 5: Hash Mismatch After Rebuild
**Symptom:** HTML references old hashed filenames
**Solution:** Always rebuild and upload together:
```powershell
cd frontend && npm run build && cd ..
gsutil -m rsync -r frontend/dist gs://tat-frontend-tax-aware-transition-tool
```

## Quick Fix Script

Run this to fix all common issues:

```powershell
# Rebuild
cd C:\Users\JosephHosler\TAT\frontend
npm run build

# Upload with correct structure
cd ..
gsutil -m rsync -r frontend/dist gs://tat-frontend-tax-aware-transition-tool

# Fix Content-Types
.\cloud\fix-frontend-content-types.ps1

# Verify
gsutil ls -r gs://tat-frontend-tax-aware-transition-tool/
```

## Alternative: Deploy Frontend to Cloud Run

If Cloud Storage continues to cause issues, you can deploy frontend to Cloud Run:

**Pros:**
- Better path handling
- Automatic Content-Type detection
- Can add SSR later
- Unified deployment model

**Cons:**
- Higher cost
- More complex setup
- Overkill for static files

**Implementation:**
Would need a simple Node.js/nginx container to serve static files.

## Recommended Next Steps

1. **Immediate:** Run Step 1-4 diagnostics
2. **Quick Fix:** Run the Quick Fix Script above
3. **Verify:** Test direct asset URLs in browser
4. **If Still Failing:** Consider Cloud Run deployment or Cloud CDN with Load Balancer
