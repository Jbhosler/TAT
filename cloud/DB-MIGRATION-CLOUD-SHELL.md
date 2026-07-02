# Database Migration – Cloud Shell Walkthrough

This guide walks you through running database migrations in **Google Cloud Shell**. Cloud Shell runs in your browser and has `gcloud` and `psql` pre-installed, so you don't need to install anything locally.

---

## Overview

- **New database:** Use `init-db.sql` (or `init-db-safe.sql` for a clean reinstall).
- **Existing database:** Use the incremental migration files in `cloud/` (e.g. `add-international-bond.sql`, `add-fixed-income-asset-classes.sql`).
- **Default values:** Instance `tat-db-instance`, database `tat_database`, user `postgres`, project `tax-aware-transition-tool`.

---

## Step 1: Open Google Cloud Console

1. Go to: **https://console.cloud.google.com**
2. Sign in with the account that has access to your project.

---

## Step 2: Open Cloud Shell

1. At the **top right** of the Cloud Console, click the **terminal icon** ( `>_` ).
2. A terminal panel opens at the bottom.
3. Wait until you see a prompt like:
   ```text
   username@cloudshell:~ (tax-aware-transition-tool)$
   ```

---

## Step 3: Set the project (if needed)

If the prompt shows a different project, run:

```bash
gcloud config set project tax-aware-transition-tool
```

*(Replace with your project ID if different.)*

---

## Step 4: Get the migration file into Cloud Shell

You need the SQL file in Cloud Shell. Two options:

**Option A – Clone the repo**

```bash
git clone https://github.com/YOUR_ORG/TAT.git
cd TAT/cloud
```

Then use `~/TAT/cloud/your-migration.sql` in Step 6.

**Option B – Create the file manually**

1. Create the file:
   ```bash
   nano add-international-bond.sql
   ```
2. Paste the contents (e.g. for International Bond):
   ```sql
   ALTER TYPE asset_class_enum ADD VALUE IF NOT EXISTS 'International Bond';
   ```
3. Save and exit: **Ctrl+X**, then **Y**, then **Enter**.

---

## Step 5: Connect to the database

Run:

```bash
gcloud sql connect tat-db-instance --user=postgres --database=tat_database
```

- **If prompted for a password:** Enter the **postgres** password for your Cloud SQL instance. The cursor does not move while typing; that's normal. Press **Enter** when done.
- When connected, the prompt changes to:
  ```text
  tat_database=>
  ```
  You are now in `psql`; the next commands are SQL or psql commands.

---

## Step 6: Run the migration

**If you have the file in Cloud Shell (e.g. cloned repo):**

At the `tat_database=>` prompt:

```text
\i add-international-bond.sql
```

Or with full path if you cloned:

```text
\i ~/TAT/cloud/add-international-bond.sql
```

**Or run the SQL directly (for simple one-liners):**

At the `tat_database=>` prompt, paste and run:

```sql
ALTER TYPE asset_class_enum ADD VALUE IF NOT EXISTS 'International Bond';
```

You should see:

```text
ALTER TYPE
```

---

## Step 7: Exit the database

At the `tat_database=>` prompt:

```text
\q
```

You're back at the shell prompt; the migration is done.

---

## Quick copy-paste (International Bond migration)

After Cloud Shell is open and the project is set (Steps 1–3):

```bash
gcloud sql connect tat-db-instance --user=postgres --database=tat_database
```

*(Enter postgres password when prompted.)*

Then at `tat_database=>`:

```sql
ALTER TYPE asset_class_enum ADD VALUE IF NOT EXISTS 'International Bond';
\q
```

---

## Migration files reference

| File | Purpose |
|------|---------|
| `init-db.sql` | Full schema for a new database (run once after creating Cloud SQL) |
| `init-db-safe.sql` | Same as above, but drops tables first (for clean reinstall) |
| `add-fixed-income-asset-classes.sql` | Adds all fixed income subclasses (Emg Bond LC, ST Corp, etc.) |
| `add-international-bond.sql` | Adds only International Bond (if you already ran fixed income migration) |
| `add-equity-and-fi-asset-classes.sql` | Adds Infrastructure, Options Overlay, Real Estate, Bank Loan, Securitized |
| `add-forced-sale-enum.sql` | Adds `forced_sale` to mapping_status_enum |
| `add-discovery-models.sql` | Adds discovery_models table and related columns |
| `add-monitoring-tables.sql` | Adds monitoring tables |
| `add-monitoring-ingest-runs.sql` | Ingest run metadata / checksum tracking |
| `add-prospect-document.sql` | Prospect document storage |
| `add-prospect-linked-account.sql` | Link prospects to monitored accounts |
| `add-pre-post-holdings.sql` | Pre/post transition holding columns |
| `add-registration-type.sql` | Registration type fields for monitored accounts |
| `add-equivalent-metrics.sql` | Product equivalent performance metrics columns |
| `add-transition-equivalent-usage.sql` | `equivalent_usage` JSONB on `transition_results` |
| `grant-app-user.sql` | Grants for app DB user after init |
| *(other `add-*.sql`)* | See `cloud/` directory for the full list |

**Which migration to run?**

- **Brand new database:** Run `init-db.sql` (or `init-db-safe.sql`).
- **Existing database, need International Bond only:** Run `add-international-bond.sql`.
- **Existing database, need new equity/FI classes (Infrastructure, Options Overlay, Real Estate, Bank Loan, Securitized):** Run `add-equity-and-fi-asset-classes.sql`.

---

## If something doesn't match

- **Instance name** – If not `tat-db-instance`:
  ```bash
  gcloud sql instances list
  ```
  Use the name from the list.

- **Database name** – If not `tat_database`, replace it in the connect command.

- **Project** – If not `tax-aware-transition-tool`, use your project ID in Step 3 and in any `gcloud` commands.

---

## Verify the migration (optional)

1. Connect again:
   ```bash
   gcloud sql connect tat-db-instance --user=postgres --database=tat_database
   ```
2. At `tat_database=>`, list asset class enum values:
   ```sql
   SELECT enumlabel FROM pg_enum
   WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'asset_class_enum')
   ORDER BY enumsortorder;
   ```
3. You should see `International Bond` in the list.
4. Exit with `\q`.
