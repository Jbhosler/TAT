# Diagnose Blank Page Issue

## Problem
No console errors, but page is completely blank. This suggests React isn't rendering.

## Possible Causes

### 1. React Router BrowserRouter Issue
**Problem:** `BrowserRouter` uses HTML5 history API which doesn't work well with Cloud Storage static hosting.

**Solution:** Switch to `HashRouter` for Cloud Storage compatibility.

### 2. Root Element Not Found
**Problem:** `document.getElementById('root')` returns null.

**Check:** Open browser console and run:
```javascript
document.getElementById('root')
```

**Expected:** Should return the div element
**If null:** HTML structure issue

### 3. CSS Not Loading (Tailwind)
**Problem:** Tailwind CSS might not be compiled or loaded.

**Check:** Open browser DevTools → Network tab → Look for CSS file
- Status should be 200
- Content-Type should be `text/css`

### 4. JavaScript Execution Error (Silent)
**Problem:** JS loads but fails silently.

**Check:** Open browser console and look for:
- Any red errors (even if they say "Failed to load resource")
- Check if React is loaded: `window.React`
- Check if ReactDOM is loaded: `window.ReactDOM`

### 5. API Connection Issue
**Problem:** LandingPage tries to connect to backend API on mount.

**Check:** Open Network tab → Look for API calls to `/api/auth/validate-passcode`
- If 404 or CORS error, backend might not be accessible

## Diagnostic Steps

### Step 1: Check Browser Console
1. Open DevTools (F12)
2. Go to Console tab
3. Look for ANY errors (even warnings)
4. Check if React is loaded: Type `window.React` in console

### Step 2: Check Network Tab
1. Open DevTools → Network tab
2. Reload page
3. Check all requests:
   - `index.html` - Should be 200
   - `index-C5qaHCQf.js` - Should be 200, Content-Type: application/javascript
   - `index-C65_JmHT.css` - Should be 200, Content-Type: text/css

### Step 3: Check Elements Tab
1. Open DevTools → Elements tab
2. Look for `<div id="root">` in the HTML
3. Check if it has any children (React should render inside it)

### Step 4: Test Root Element
In browser console, run:
```javascript
// Check if root exists
const root = document.getElementById('root');
console.log('Root element:', root);

// Check if React is trying to mount
console.log('React:', window.React);
console.log('ReactDOM:', window.ReactDOM);
```

### Step 5: Check API Connection
In browser console, run:
```javascript
// Test API endpoint
fetch('https://tat-backend-vzkn2vygsa-uc.a.run.app/api/health')
  .then(r => r.json())
  .then(d => console.log('Backend health:', d))
  .catch(e => console.error('Backend error:', e));
```

## Quick Fix: Switch to HashRouter

If BrowserRouter is the issue, switch to HashRouter:

1. Edit `frontend/src/App.tsx`
2. Change `BrowserRouter` to `HashRouter`
3. Rebuild and re-upload

This will make URLs like: `https://storage.googleapis.com/.../index.html#/dashboard`

## Alternative: Add Basename to BrowserRouter

If you want to keep BrowserRouter, add basename:

```tsx
<Router basename="/">
  <Routes>
    ...
  </Routes>
</Router>
```

But HashRouter is more reliable for Cloud Storage.
