# Database steps: add `forced_sale` enum (shell)

Run these in order. **PowerShell** does not support `<` redirection, and **IPv6** networks often block direct `gcloud sql connect`; use one of the options below.

---

## Easiest: Cloud Console SQL Editor (works from anywhere, no shell redirection)

1. Open: **https://console.cloud.google.com/sql/instances/tat-db-instance/databases**
2. Click the database **tat_database** (or your DB name).
3. Open the **SQL** / query tab (or “Open Cloud Shell” and use the SQL client there).
4. Run this one line:

```sql
ALTER TYPE mapping_status_enum ADD VALUE IF NOT EXISTS 'forced_sale';
```

5. Execute. Done.

---

## Option 2: Cloud Shell (browser – bash, avoids IPv6)

In Google Cloud Console, open **Cloud Shell** (terminal icon). Then:

```bash
gcloud config set project tax-aware-transition-tool
gcloud sql connect tat-db-instance --user=postgres --database=tat_database
```

At the `psql` prompt, paste and run:

```sql
ALTER TYPE mapping_status_enum ADD VALUE IF NOT EXISTS 'forced_sale';
\q
```

*(In Cloud Shell, `< file` works in bash, but typing the line above is usually simplest.)*

---

## Option 3: PowerShell (Windows) – no `<` redirection

**A) Connect and run SQL interactively**

```powershell
gcloud beta sql connect tat-db-instance --user=postgres --database=tat_database
```

If that fails with an IPv6 error, use **Cloud Shell** or **Cloud SQL Proxy** (Option 4) instead.

When you get a `psql` prompt, run:

```sql
ALTER TYPE mapping_status_enum ADD VALUE IF NOT EXISTS 'forced_sale';
\q
```

**B) Pipe the SQL file (beta uses proxy; may work from IPv6)**

From the **project root** (folder that contains `cloud`):

```powershell
Get-Content cloud/add-forced-sale-enum.sql | gcloud beta sql connect tat-db-instance --user=postgres --database=tat_database
```

*(Do **not** use `<` in PowerShell; it is not supported for this.)*

---

## Option 4: Cloud SQL Proxy + psql (works from IPv6 / local)

1. **Download Cloud SQL Proxy:** https://cloud.google.com/sql/docs/postgres/sql-proxy  
2. **Terminal 1 – start proxy:**

   ```powershell
   .\cloud-sql-proxy.exe tax-aware-transition-tool:us-central1:tat-db-instance
   ```

   *(Or `cloud_sql_proxy` on Linux/macOS.)*

3. **Terminal 2 – run migration:**

   ```powershell
   psql -h 127.0.0.1 -U postgres -d tat_database -f cloud/add-forced-sale-enum.sql
   ```

   If `psql` is not in PATH, use the full path to `psql.exe` (e.g. from a PostgreSQL install).

---

## 1. Set project (when using gcloud)

```bash
gcloud config set project tax-aware-transition-tool
```

*(If your project ID is different, use that instead.)*

---

## 2. SQL to run (any method)

You need a user that can run `ALTER TYPE` (e.g. `postgres`). Run this once:

```sql
ALTER TYPE mapping_status_enum ADD VALUE IF NOT EXISTS 'forced_sale';
```

---

## 3. Confirm the enum value exists (optional)

Connect again:

```bash
gcloud sql connect tat-db-instance --user=postgres --database=tat_database
```

In `psql`:

```sql
SELECT enumlabel FROM pg_enum
WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'mapping_status_enum')
ORDER BY enumsortorder;
```

You should see: `mapped`, `unmapped`, `multi_asset`, `forced_sale`.

Exit:

```sql
\q
```

---

## If the instance or database name is different

List instances:

```bash
gcloud sql instances list
```

Use your instance name in place of `tat-db-instance`, and your database name in place of `tat_database` in the commands above.

---

## If you're not using Cloud SQL (e.g. local PostgreSQL)

With `psql` and the correct connection details:

```bash
psql -h localhost -U postgres -d tat_database -f cloud/add-forced-sale-enum.sql
```

Or connect and run the `ALTER TYPE` line manually (see “SQL to run” above).
