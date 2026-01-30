# Database steps: add `pre_holdings` and `post_holdings` to `transition_results`

These columns store the full legacy (pre-trade) and proposed (post-trade) holdings by asset class so the Tax Summary tile can show a pre vs post comparison.

**When to run:** Only if your database was created **before** this change. New databases created with `init-db.sql` or `init-db-safe.sql` already include these columns.

**Effect:** Adds two optional JSONB columns to `transition_results`. Existing rows will have `NULL` until you re-run **Calculate** for each prospect; new calculations will populate them.

---

## Easiest: Cloud Console SQL Editor (works from anywhere)

1. Open: **https://console.cloud.google.com/sql/instances/tat-db-instance/databases**
2. Click the database **tat_database** (or your DB name).
3. Open the **SQL** / query tab.
4. Run:

```sql
ALTER TABLE transition_results ADD COLUMN IF NOT EXISTS pre_holdings JSONB;
ALTER TABLE transition_results ADD COLUMN IF NOT EXISTS post_holdings JSONB;
```

5. Execute. Done.

---

## Option 2: Cloud Shell (browser – bash)

In Google Cloud Console, open **Cloud Shell**. Then:

```bash
gcloud config set project tax-aware-transition-tool
gcloud sql connect tat-db-instance --user=postgres --database=tat_database
```

At the `psql` prompt, paste and run:

```sql
ALTER TABLE transition_results ADD COLUMN IF NOT EXISTS pre_holdings JSONB;
ALTER TABLE transition_results ADD COLUMN IF NOT EXISTS post_holdings JSONB;
\q
```

Or run the migration file (from project root in Cloud Shell):

```bash
psql "host=/cloudsql/tax-aware-transition-tool:us-central1:tat-db-instance user=postgres dbname=tat_database" -f cloud/add-pre-post-holdings.sql
```

*(Exact connection string may vary; use the one shown after `gcloud sql connect` if you use a proxy.)*

---

## Option 3: PowerShell (Windows)

**A) Connect and run SQL interactively**

```powershell
gcloud beta sql connect tat-db-instance --user=postgres --database=tat_database
```

At the `psql` prompt, run:

```sql
ALTER TABLE transition_results ADD COLUMN IF NOT EXISTS pre_holdings JSONB;
ALTER TABLE transition_results ADD COLUMN IF NOT EXISTS post_holdings JSONB;
\q
```

**B) Pipe the SQL file**

From the **project root** (folder that contains `cloud`):

```powershell
Get-Content cloud/add-pre-post-holdings.sql | gcloud beta sql connect tat-db-instance --user=postgres --database=tat_database
```

---

## Option 4: Cloud SQL Proxy + psql (local)

1. Start Cloud SQL Proxy (see project docs or Cloud Console).
2. In another terminal, from project root:

```powershell
psql "host=127.0.0.1 port=5432 user=postgres dbname=tat_database" -f cloud/add-pre-post-holdings.sql
```

*(Adjust host/port/user/dbname to match your proxy and database.)*

---

## After the migration

- **Existing transition results:** Rows that already exist will have `pre_holdings` and `post_holdings` as `NULL`. The app will show a fallback message and the previous post-trades table.
- **New calculations:** Run **Calculate** again for a prospect; the new result will have `pre_holdings` and `post_holdings` populated, and the Tax Summary will show the full pre vs post comparison by asset class.

---

## Verify columns exist

Connect to the database and run:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'transition_results'
  AND column_name IN ('pre_holdings', 'post_holdings');
```

You should see two rows: `pre_holdings` and `post_holdings`, both `jsonb`, nullable.
