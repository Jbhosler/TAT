# Custom domain HTTPS for TAT (`tat.auourinvest.com`)

This guide fixes the browser **“Not secure”** warning when the SSL certificate in Google Cloud looks correct but the site still fails HTTPS checks.

**Project:** `tax-aware-transition-tool`  
**Region:** `us-central1`  
**Frontend bucket:** `tat-frontend-tax-aware-transition-tool`  
**Custom domain:** `tat.auourinvest.com`  
**Backend API:** Cloud Run `tat-backend` (already HTTPS; CORS allows `*.auourinvest.com`)

---

## Why the site shows “Not secure” today

Current DNS points `tat.auourinvest.com` at Google Cloud Storage **directly**:

| Record | Typical value today |
|--------|---------------------|
| `tat` CNAME | `c.storage.googleapis.com` |

That works over **HTTP**, but HTTPS presents Google’s certificate for **storage** (e.g. `*.storage.googleapis.com`), **not** for `tat.auourinvest.com`. Browsers then report a certificate name mismatch or “Not secure,” even if you created a managed certificate elsewhere in the project that is **not** attached to the traffic path users hit.

**Fix:** Put an **external HTTPS Application Load Balancer** in front of the bucket, attach a **Google-managed certificate** for `tat.auourinvest.com`, and point DNS to the load balancer IP with an **A record** (not a CNAME to `c.storage.googleapis.com`).

Official reference: [Host a static website (HTTPS with load balancer)](https://cloud.google.com/storage/docs/hosting-static-website).

---

## Architecture (before vs after)

```text
BEFORE (broken HTTPS)
  Browser → tat.auourinvest.com (CNAME) → c.storage.googleapis.com
           TLS cert: *.storage.googleapis.com  ✗ name mismatch

AFTER (correct HTTPS)
  Browser → tat.auourinvest.com (A record) → External HTTPS Load Balancer
           TLS cert: tat.auourinvest.com      ✓
           → Backend bucket → gs://tat-frontend-tax-aware-transition-tool
```

---

## Prerequisites

1. **Access** to Google Cloud Console (project `tax-aware-transition-tool`) and your DNS host for `auourinvest.com` (e.g. Google Domains, Cloud DNS, registrar).
2. **gcloud CLI** logged in (optional but useful for verification):

   ```powershell
   gcloud auth login
   gcloud config set project tax-aware-transition-tool
   ```

3. **Frontend bucket** already deployed (see `cloud/deploy-backend-and-frontend.ps1` or `cloud/deploy-frontend.sh`).
4. **Plan a short DNS cutover** (minutes to hours for TTL propagation). HTTP may keep working during setup; switch DNS only after the load balancer and certificate are ready.

---

## Part 1 — Enable APIs

In **Console:** APIs & Services → Enable APIs, or run:

```powershell
gcloud services enable compute.googleapis.com
gcloud services enable certificatemanager.googleapis.com
```

(`compute.googleapis.com` covers external HTTP(S) load balancing.)

---

## Part 2 — Reserve a global static IP

You will point DNS to this IP.

### Console

1. **Network services** → **VPC network** → **IP addresses** (or search “IP addresses”).
2. **Reserve external static IP address**.
3. **Name:** `tat-frontend-lb-ip`
4. **Network service tier:** Premium  
5. **IP version:** IPv4  
6. **Type:** Global  
7. **Reserved**, then **Reserve**.

Note the IP (e.g. `34.x.x.x`). You need it for DNS in Part 6.

### CLI

```powershell
gcloud compute addresses create tat-frontend-lb-ip --global
gcloud compute addresses describe tat-frontend-lb-ip --global --format="value(address)"
```

---

## Part 3 — Backend bucket (GCS as origin)

Links the load balancer to your existing frontend bucket.

### Console

1. **Network services** → **Load balancing** → **Backends** tab (or create via Load Balancer wizard).
2. **Create backend** → **Backend buckets** → **Create**.
3. **Name:** `tat-frontend-backend-bucket`
4. **Cloud Storage bucket:** `tat-frontend-tax-aware-transition-tool`
5. **Cloud CDN:** optional (recommended for JS/CSS; keep `index.html` low-cache — your deploy script already sets `Cache-Control: no-cache` on HTML).
6. **Create**.

### CLI

```powershell
gcloud compute backend-buckets create tat-frontend-backend-bucket `
  --gcs-bucket-name=tat-frontend-tax-aware-transition-tool `
  --enable-cdn
```

---

## Part 4 — URL map (routing)

For a single-page app (React), the default route sends all paths to the backend bucket. You will add a **custom error response** so client-side routes do not 404 on refresh.

### Console — URL map

1. **Load balancing** → **URL maps** → **Create URL map**.
2. **Name:** `tat-frontend-url-map`
3. **Default backend:** `tat-frontend-backend-bucket`
4. **Create**.

### Console — SPA fallback (important)

1. Open `tat-frontend-url-map` → **Edit**.
2. **Host and path rules** → default rule → **Route action** / **Advanced** (wording varies).
3. Add **custom error response** (or edit backend bucket error policy):
   - **Error code:** `404`
   - **Response:** route to same backend bucket, or **substitute path:** `/index.html`
   - **Override response code:** `200` (so the SPA loads instead of a GCS XML 404)

If the UI does not expose this on the URL map, set it on the **backend bucket**: edit backend bucket → **Custom error response** → 404 → serve `/index.html` with response code 200.

Without this step, deep links like `https://tat.auourinvest.com/monitoring` may break on refresh.

### CLI (minimal URL map)

```powershell
gcloud compute url-maps create tat-frontend-url-map `
  --default-backend-bucket=tat-frontend-backend-bucket
```

Add custom error response via Console if CLI flags are awkward on your SDK version.

---

## Part 5 — Google-managed SSL certificate

Create the certificate **before** final DNS cutover. It becomes **ACTIVE** only after Google can validate domain control (DNS must point to the LB IP or you use DNS authorization records).

### Console

1. **Network services** → **Load balancing** → **Certificates** (or **Certificate Manager**).
2. **Create SSL certificate** → **Google-managed**.
3. **Name:** `tat-auourinvest-cert`
4. **Domains:** `tat.auourinvest.com`  
   (Add `www.tat.auourinvest.com` only if you will use that hostname.)
5. **Create**.

Status will show **PROVISIONING** until DNS is correct, then **ACTIVE** (often 15–60 minutes, sometimes longer).

### CLI

```powershell
gcloud compute ssl-certificates create tat-auourinvest-cert `
  --domains=tat.auourinvest.com `
  --global
```

Check status:

```powershell
gcloud compute ssl-certificates describe tat-auourinvest-cert --global --format="yaml(managed.status,managed.domainStatus)"
```

---

## Part 6 — HTTPS load balancer (forwarding rules)

### Console (recommended wizard)

1. **Load balancing** → **Create load balancer**.
2. **Application Load Balancer (HTTP/HTTPS)** → **Start configuration**.
3. **Internet facing** → **Global external** → **Best for global workloads**.
4. **Name:** `tat-frontend-https-lb`
5. **Frontend:**
   - **Protocol:** HTTPS  
   - **IP:** `tat-frontend-lb-ip` (reserved in Part 2)  
   - **Certificate:** `tat-auourinvest-cert`  
   - **Port:** 443  
6. **Backend:** `tat-frontend-url-map` (from Part 4).
7. **Create** (review summary, then create).

### Optional — redirect HTTP → HTTPS

Add a second frontend on the **same** load balancer:

- **Protocol:** HTTP  
- **Port:** 80  
- **Same IP:** `tat-frontend-lb-ip`  
- **Action:** Redirect to HTTPS (301).

Or add an HTTP forwarding rule via CLI after the HTTPS rule exists.

### CLI (HTTPS forwarding rule)

After URL map, cert, and IP exist:

```powershell
# HTTPS proxy
gcloud compute target-https-proxies create tat-frontend-https-proxy `
  --url-map=tat-frontend-url-map `
  --ssl-certificates=tat-auourinvest-cert

# Forwarding rule (443)
gcloud compute forwarding-rules create tat-frontend-https-rule `
  --global `
  --target-https-proxy=tat-frontend-https-proxy `
  --address=tat-frontend-lb-ip `
  --ports=443
```

---

## Part 7 — Update DNS (cutover)

At your DNS provider for `auourinvest.com`:

### Remove (stops wrong HTTPS cert)

| Type | Host | Action |
|------|------|--------|
| CNAME | `tat` | **Delete** if it points to `c.storage.googleapis.com` |

### Add

| Type | Host | Value | TTL |
|------|------|--------|-----|
| A | `tat` | `<LOAD_BALANCER_IP from Part 2>` | 300–3600 |

Do **not** use a CNAME to `c.storage.googleapis.com` after cutover.

**Propagation:** wait 5–60+ minutes (depends on TTL). The managed certificate will stay **PROVISIONING** until Google sees the A record pointing at the LB.

---

## Part 8 — Verify HTTPS and the app

### Certificate and TLS

```powershell
# Should succeed without -k (no insecure skip)
curl.exe -sI "https://tat.auourinvest.com/"
```

In the browser:

1. Open `https://tat.auourinvest.com`
2. Padlock → **Connection is secure**
3. Certificate → **Subject** includes `tat.auourinvest.com` (not `storage.googleapis.com`)

### SPA routes

- `https://tat.auourinvest.com/` loads the app.
- `https://tat.auourinvest.com/monitoring` loads after refresh (if Part 4 custom 404 → `index.html` is set).

### API / CORS

The app calls Cloud Run (`tat-backend`). Backend CORS already allows origins ending with `.auourinvest.com`. No change required unless you add another domain.

### Optional — SSL Labs

https://www.ssllabs.com/ssltest/analyze.html?d=tat.auourinvest.com

---

## Part 9 — Ongoing deploys (no DNS change)

Frontend deploys sync to **both** buckets (see `cloud/sync-frontend-to-gcs.ps1`):

| Bucket | Served when |
|--------|-------------|
| `tat-frontend-tax-aware-transition-tool` | `storage.googleapis.com/...` URL and load balancer backend `auour-backend` |
| `tat.auourinvest.com` | DNS CNAME `tat` → `c.storage.googleapis.com` (domain-named bucket) |

If you only deploy to `tat-frontend-...`, **https://tat.auourinvest.com** can stay on an old bundle even though the storage.googleapis.com URL is current.

```powershell
.\cloud\deploy-backend-and-frontend.ps1
# or frontend-only: .\cloud\deploy-frontend-only.ps1
```

If CDN is enabled on `auour-lb`, deploy scripts also request cache invalidation. After cutover to the load balancer IP, you may rely on a single bucket—but until DNS changes, both buckets must stay in sync:

```powershell
gcloud compute url-maps invalidate-cdn-cache tat-frontend-url-map --path "/*"
```

---

## Troubleshooting

| Symptom | Likely cause | What to do |
|--------|----------------|------------|
| Certificate stuck **PROVISIONING** | DNS still CNAME to GCS, or A record wrong IP | Confirm A → LB IP; wait; check `domainStatus` on cert |
| **NET::ERR_CERT_COMMON_NAME_INVALID** | Still hitting `c.storage.googleapis.com` | Remove CNAME; flush DNS; test from another network |
| Padlock OK but **blank page** / 404 on assets | Wrong bucket in backend bucket, or CDN cache | `gsutil ls gs://tat-frontend-tax-aware-transition-tool/assets/`; invalidate CDN |
| **404 on refresh** of `/monitoring/...` | No SPA custom error response | Part 4: 404 → `/index.html` with 200 |
| **Mixed content** warning | Page HTTPS but API HTTP | Rebuild frontend with `VITE_API_URL=https://...run.app` |
| Old JS bundle after deploy | CDN or browser cache | Invalidate CDN; hard refresh (Ctrl+Shift+R) |

### Useful commands

```powershell
# DNS (should show your LB IP, not only google storage aliases)
nslookup tat.auourinvest.com

# Managed cert status
gcloud compute ssl-certificates describe tat-auourinvest-cert --global

# LB forwarding rules
gcloud compute forwarding-rules list --global

# Bucket contents
gsutil ls gs://tat-frontend-tax-aware-transition-tool/
gsutil ls gs://tat-frontend-tax-aware-transition-tool/assets/
```

---

## Checklist (printable)

- [ ] APIs enabled (`compute.googleapis.com`)
- [ ] Global static IP reserved (`tat-frontend-lb-ip`)
- [ ] Backend bucket → `tat-frontend-tax-aware-transition-tool`
- [ ] URL map with default backend bucket
- [ ] Custom 404 → `/index.html` (200) for SPA
- [ ] Google-managed cert for `tat.auourinvest.com` → **ACTIVE**
- [ ] HTTPS load balancer on reserved IP (port 443)
- [ ] Optional HTTP → HTTPS redirect (port 80)
- [ ] DNS: removed CNAME to `c.storage.googleapis.com`
- [ ] DNS: A record `tat` → load balancer IP
- [ ] Browser shows secure padlock; cert CN matches domain
- [ ] App loads and API calls succeed

---

## Related docs in this repo

| Document | Purpose |
|----------|---------|
| [DEPLOY_STEPS_GOOGLE_CLOUD.md](DEPLOY_STEPS_GOOGLE_CLOUD.md) | Full GCP deploy |
| [deploy-backend-and-frontend.ps1](deploy-backend-and-frontend.ps1) | Deploy script |
| [CHECK_CORS_DEPLOYMENT.md](CHECK_CORS_DEPLOYMENT.md) | CORS after URL changes |
| [FRONTEND_DIAGNOSTIC_PLAN.md](FRONTEND_DIAGNOSTIC_PLAN.md) | Bucket / asset issues |
| [TROUBLESHOOTING-INDEX.md](TROUBLESHOOTING-INDEX.md) | Index of cloud docs |

---

## Summary

- **Root cause:** `tat.auourinvest.com` CNAME → `c.storage.googleapis.com` cannot use your custom-domain certificate on HTTPS.
- **Fix:** External HTTPS load balancer + backend bucket + Google-managed cert + **A record** to the LB IP.
- **Deploy path unchanged:** still upload to `gs://tat-frontend-tax-aware-transition-tool`; only public **entry** DNS changes.

If you already created a certificate in GCP that never went **ACTIVE**, it was likely waiting for DNS validation on the load balancer IP—reuse that cert on the new HTTPS frontend once DNS is correct.
