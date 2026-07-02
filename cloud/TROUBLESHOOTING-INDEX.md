# Cloud folder: troubleshooting index

Use this map when you are debugging deploys, DB drift, or static hosting. **Start with the canonical guides**; the diagnostic and “fix” notes below are mostly **historical playbooks** from specific incidents—steps may overlap or be superseded by current scripts.

---

## Canonical guides (prefer these)

| Document | Use when |
|----------|----------|
| [README.md](README.md) | High-level Cloud deploy flow, migrations overview |
| [DEPLOY_STEPS_GOOGLE_CLOUD.md](DEPLOY_STEPS_GOOGLE_CLOUD.md) | Step-by-step GCP deploy (PowerShell-oriented paths OK) |
| [DEPLOY_WINDOWS.md](DEPLOY_WINDOWS.md) | Windows: WSL, Git Bash, or raw `gcloud` |
| [DB-MIGRATION-CLOUD-SHELL.md](DB-MIGRATION-CLOUD-SHELL.md) | Running `init-db` / `add-*.sql` in Cloud Shell |
| [CLOUD_SHELL_INSTRUCTIONS.md](CLOUD_SHELL_INSTRUCTIONS.md) | Older but detailed Cloud Shell + `psql` patterns |
| [CHECK_CORS_DEPLOYMENT.md](CHECK_CORS_DEPLOYMENT.md) | CORS checks after backend/frontend changes |
| [CUSTOM_DOMAIN_HTTPS_SETUP.md](CUSTOM_DOMAIN_HTTPS_SETUP.md) | **HTTPS / “Not secure”** for `tat.auourinvest.com` (load balancer + managed cert) |
| [SET_IAM_MANUAL.md](SET_IAM_MANUAL.md) | IAM fixes when buckets or Cloud Run access misbehave |

Root repo: [../DEPLOYMENT.md](../DEPLOYMENT.md), [../QUICK_START.md](../QUICK_START.md).

---

## Database: feature-specific SQL steps

| Document | Topic |
|----------|--------|
| [DB-STEPS-CLOUD-SHELL.md](DB-STEPS-CLOUD-SHELL.md) | General DB steps in Cloud Shell |
| [DB-STEPS-DISCOVERY-CLOUD-SHELL.md](DB-STEPS-DISCOVERY-CLOUD-SHELL.md) | Discovery models |
| [DB-STEPS-FORCED-SALE.md](DB-STEPS-FORCED-SALE.md) | Forced-sale enum / flow |
| [DB-STEPS-PRE-POST-HOLDINGS.md](DB-STEPS-PRE-POST-HOLDINGS.md) | Pre/post holdings columns |
| [DB-STEPS-PRE-POST-HOLDINGS-CLOUD-SHELL.md](DB-STEPS-PRE-POST-HOLDINGS-CLOUD-SHELL.md) | Same, Cloud Shell variant |
| [DB-STEPS-PROSPECT-LINKED-ACCOUNT.md](DB-STEPS-PROSPECT-LINKED-ACCOUNT.md) | Prospect ↔ monitored account linking |
| [DB-STEPS-PROSPECT-LINKED-ACCOUNT-CLOUD-SHELL.md](DB-STEPS-PROSPECT-LINKED-ACCOUNT-CLOUD-SHELL.md) | Same, Cloud Shell variant |

---

## Frontend / static hosting incident notes

These documents trace **blank pages, 404s, wrong content-types, and asset paths** on Cloud Storage. Compare with your current `frontend` build and `cloud` deploy scripts before following verbatim.

| Document | Rough topic |
|----------|-------------|
| [FRONTEND_DIAGNOSTIC_PLAN.md](FRONTEND_DIAGNOSTIC_PLAN.md) | Planned checks for frontend deploy issues |
| [COMPREHENSIVE_FRONTEND_DIAGNOSTIC.md](COMPREHENSIVE_FRONTEND_DIAGNOSTIC.md) | Broad frontend/CDN diagnostic |
| [DEFINITIVE_DIAGNOSTIC.md](DEFINITIVE_DIAGNOSTIC.md) | Consolidated diagnostic pass |
| [DIAGNOSE_BLANK_PAGE.md](DIAGNOSE_BLANK_PAGE.md) | Blank page |
| [ROOT_CAUSE_AND_FIX.md](ROOT_CAUSE_AND_FIX.md) | Root-cause write-up |
| [MANUAL_FIX_404.md](MANUAL_FIX_404.md) | 404 on assets or routes |
| [MANUAL_FRONTEND_FIX.md](MANUAL_FRONTEND_FIX.md) | Manual frontend repair steps |
| [FINAL_FRONTEND_FIX.md](FINAL_FRONTEND_FIX.md) | Late-stage frontend fix |
| [FINAL_FIX_RELATIVE_PATHS.md](FINAL_FIX_RELATIVE_PATHS.md) | Base URL / relative path issues |
| [VERIFY_AND_FIX_FINAL.md](VERIFY_AND_FIX_FINAL.md) | Verification + final fixes |
| [VERIFY_BUCKET_HTML.md](VERIFY_BUCKET_HTML.md) | Bucket HTML entrypoint |
| [verify-bucket-contents.md](verify-bucket-contents.md) | Bucket inventory checks |

---

## Uploads, assets, and data quality

| Document | Topic |
|----------|--------|
| [UPLOAD_REVIEW_AND_TEST_PLAN.md](UPLOAD_REVIEW_AND_TEST_PLAN.md) | Upload review / testing |
| [ASSET-MAPPING-DIAGNOSTIC-PLAN.md](ASSET-MAPPING-DIAGNOSTIC-PLAN.md) | Asset class / mapping investigation plan |

---

## Adding new notes

Prefer **one incremental `add-*.sql` plus a short DB-STEPS doc** for schema changes, and **a dated note in `docs/`** for long investigations. Link new Cloud Shell or deploy write-ups from this file under the right section so the next person finds them quickly.
