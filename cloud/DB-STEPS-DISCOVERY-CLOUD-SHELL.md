# Discovery Models Migration – Google Cloud Shell Walkthrough

This adds the **discovery_models** table (bridge for vendor model names), **external_model_name** on monitored_accounts, **is_unmapped** on account_snapshots, and backfills from existing strategy name mappings.

Use **Google Cloud Shell** in the browser. Follow the steps in order.

---

## Step 1: Open Google Cloud Console

1. Go to: **https://console.cloud.google.com**
2. Sign in with the account that has access to the **tax-aware-transition-tool** project (or your project).

---

## Step 2: Open Cloud Shell

1. At the **top right** of the Cloud Console, click the **terminal icon** ( `>_` ).
2. A terminal panel opens at the bottom.
3. Wait until you see a prompt like:
   ```text
   username@cloudshell:~ (tax-aware-transition-tool)$
   ```
   If you see a different project name, set the project in Step 3.

---

## Step 3: Set the project (if needed)

In the Cloud Shell terminal, run:

```bash
gcloud config set project tax-aware-transition-tool
```

*(Replace `tax-aware-transition-tool` with your project ID if different.)*

---

## Step 4: Put the migration file in Cloud Shell

You need `add-discovery-models.sql` in your Cloud Shell home directory so you can run it from `psql`.

**Option A – Clone the repo (if you use Git)**

```bash
git clone https://github.com/YOUR_ORG/TAT.git
cd TAT/cloud
```

Then in Step 5 you’ll run the migration from `~/TAT/cloud` (see below).

**Option B – Create the file in Cloud Shell**

1. Create the file:
   ```bash
   nano add-discovery-models.sql
   ```
2. Paste the **entire** contents of `cloud/add-discovery-models.sql` from your local project (from the repo on your machine).
3. Save and exit: **Ctrl+X**, then **Y**, then **Enter**.

If you used Option B, stay in your home directory (`~`) for Step 5. If you used Option A, use `~/TAT/cloud` when you run the migration.

---

## Step 5: Connect to the database

Run:

```bash
gcloud sql connect tat-db-instance --user=postgres --database=tat_database
```

- **If prompted for a password:** enter the **postgres** password for your Cloud SQL instance (cursor does not move while typing; that’s normal). Press **Enter** when done.
- When connected, the prompt changes to something like:
  ```text
  tat_database=>
  ```
  You are now in `psql`; the next commands are SQL or psql commands.

---

## Step 6: Run the migration

**If you created the file in your home directory (Option B):**

At the `tat_database=>` prompt, run:

```text
\i add-discovery-models.sql
```

**If you cloned the repo (Option A):**

At the `tat_database=>` prompt, run:

```text
\i ~/TAT/cloud/add-discovery-models.sql
```

You should see output similar to:

```text
CREATE TABLE
CREATE INDEX
CREATE INDEX
CREATE TRIGGER
ALTER TABLE
ALTER TABLE
ADD COLUMN
ALTER TABLE
ADD COLUMN
INSERT 0 N
COMMENT
COMMENT
COMMENT
```

*(Exact line count may vary. “INSERT 0 N” means N rows were backfilled from `strategy_name_mappings`; N can be 0 if there were no mappings.)*

---

## Step 7: Exit the database

At the `tat_database=>` prompt, type:

```text
\q
```

You’re back at the shell prompt; the migration is done.

---

## Step 8 (optional): Verify the migration

1. Connect again (same as Step 5):
   ```bash
   gcloud sql connect tat-db-instance --user=postgres --database=tat_database
   ```
2. Enter the postgres password if prompted.
3. At `tat_database=>`, run:

   **Check the new table:**
   ```sql
   \d discovery_models
   ```
   You should see columns: `id`, `external_model_name`, `internal_strategy_id`, `last_seen`, `is_active`, `created_at`, `updated_at`.

   **Check new columns:**
   ```sql
   SELECT column_name, data_type, is_nullable
   FROM information_schema.columns
   WHERE table_name = 'monitored_accounts' AND column_name = 'external_model_name';
   ```
   One row: `external_model_name`, character varying, YES.

   ```sql
   SELECT column_name, data_type, is_nullable
   FROM information_schema.columns
   WHERE table_name = 'account_snapshots' AND column_name = 'is_unmapped';
   ```
   One row: `is_unmapped`, boolean, NO.

4. Exit:
   ```text
   \q
   ```

---

## If something doesn’t match

- **Instance name**  
  If your instance is not `tat-db-instance`:
  ```bash
  gcloud sql instances list
  ```
  Use the name from the list in the `gcloud sql connect` command.

- **Database name**  
  If your database is not `tat_database`, replace `tat_database` in the connect command with your database name.

- **Project**  
  If your project is not `tax-aware-transition-tool`, use your project ID in Step 3 and in any `gcloud` commands.

- **`function update_updated_at_column() does not exist`**  
  Your database may not have been created with `init-db.sql` / `init-db-safe.sql` (which create this function). Run the function creation from `cloud/add-ticker-mappings-updated-at.sql` (the `CREATE OR REPLACE FUNCTION update_updated_at_column()...` block) in Cloud Shell first, then run `add-discovery-models.sql` again.

---

## Quick copy-paste (Steps 5–7)

After the project is set and the migration file is in place (Steps 1–4), you can do:

```bash
gcloud sql connect tat-db-instance --user=postgres --database=tat_database
```

*(Enter postgres password when prompted.)*

Then at `tat_database=>`:

```text
\i add-discovery-models.sql
\q
```

*(If the file is in `~/TAT/cloud`, use `\i ~/TAT/cloud/add-discovery-models.sql` instead.)*

That’s the full discovery migration.
