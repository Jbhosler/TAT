# Add `forced_sale` enum – Cloud Shell (detailed steps)

Use **Cloud Shell** in the browser so you avoid IPv6 and PowerShell issues. Follow each step in order.

---

## Step 1: Open Google Cloud Console

1. In your browser, go to: **https://console.cloud.google.com**
2. Sign in with the Google account that has access to the **tax-aware-transition-tool** project (or your project).

---

## Step 2: Open Cloud Shell

1. At the **top right** of the Cloud Console page, look for the **terminal icon** ( `>_` ) in the toolbar.
2. Click that icon.  
   - Or use the **Activate Cloud Shell** button if you see it.
3. A panel will open at the **bottom** of the page with a terminal.
4. Wait until you see a **prompt** that looks like:
   ```text
   username@cloudshell:~ (tax-aware-transition-tool)$
   ```
   The `(tax-aware-transition-tool)` is your current project. If you see a different project name, continue to Step 3 to set the project.

---

## Step 3: Set the correct project (if needed)

1. In the Cloud Shell terminal, type exactly (then press **Enter**):
   ```bash
   gcloud config set project tax-aware-transition-tool
   ```
2. You should see something like:
   ```text
   Updated property [core/project].
   ```
   If your project ID is different, replace `tax-aware-transition-tool` with your project ID.

---

## Step 4: Connect to the database

1. In the same terminal, type (then press **Enter**):
   ```bash
   gcloud sql connect tat-db-instance --user=postgres --database=tat_database
   ```
2. **If you are asked for a password:**  
   - Enter the **postgres** user password for your Cloud SQL instance.  
   - (You set this when you created the instance, or it may be in your project secrets.)  
   - The cursor will not move as you type; that is normal. Press **Enter** when done.
3. When the connection works, the prompt will change to something like:
   ```text
   tat_database=>
   ```
   That means you are connected to PostgreSQL; the next commands are SQL or psql commands, not bash.

---

## Step 5: Run the migration SQL

1. At the `tat_database=>` prompt, type or paste this **exactly** (then press **Enter**):
   ```sql
   ALTER TYPE mapping_status_enum ADD VALUE IF NOT EXISTS 'forced_sale';
   ```
2. You should see:
   ```text
   ALTER TYPE
   ```
   That means the new enum value was added (or it already existed and nothing changed).
3. If you see an error instead, check that you are in the right project and database and that the type name is `mapping_status_enum`.

---

## Step 6: Exit the database connection

1. At the `tat_database=>` prompt, type (then press **Enter**):
   ```text
   \q
   ```
2. The prompt should return to something like:
   ```text
   username@cloudshell:~ (tax-aware-transition-tool)$
   ```
   You are back in the shell; the migration is done.

---

## Step 7 (optional): Confirm the enum value exists

1. Connect again (same as Step 4):
   ```bash
   gcloud sql connect tat-db-instance --user=postgres --database=tat_database
   ```
2. Enter the postgres password if prompted.
3. At the `tat_database=>` prompt, run:
   ```sql
   SELECT enumlabel FROM pg_enum
   WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'mapping_status_enum')
   ORDER BY enumsortorder;
   ```
4. You should see four rows: `mapped`, `unmapped`, `multi_asset`, `forced_sale`.
5. Exit again:
   ```text
   \q
   ```

---

## If something doesn’t match

- **Instance name:** If your instance is not `tat-db-instance`, use:
  ```bash
  gcloud sql instances list
  ```
  and replace `tat-db-instance` with the name from the list.
- **Database name:** If your database is not `tat_database`, replace `tat_database` in the `gcloud sql connect` command with your database name.
- **Project:** If your project is not `tax-aware-transition-tool`, use your project ID in Step 3 and in any `gcloud` commands.

---

## Quick copy-paste (Steps 4–6 only)

After Cloud Shell is open and the project is set (Steps 1–3), you can do:

```bash
gcloud sql connect tat-db-instance --user=postgres --database=tat_database
```

*(Enter postgres password when prompted.)*

Then at `tat_database=>`:

```sql
ALTER TYPE mapping_status_enum ADD VALUE IF NOT EXISTS 'forced_sale';
\q
```

That’s the full migration.

---

## If you get: `column ticker_mappings.updated_at does not exist`

Your database was created before the `ticker_mappings` table had an `updated_at` column. Add it by running the migration in Cloud Shell.

1. Connect the same way (Steps 1–4 above).
2. At the `tat_database=>` prompt, run the contents of **`cloud/add-ticker-mappings-updated-at.sql`**, or run these lines one by one:

```sql
ALTER TABLE ticker_mappings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
UPDATE ticker_mappings SET updated_at = created_at WHERE updated_at IS NULL;
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';
DROP TRIGGER IF EXISTS update_ticker_mappings_updated_at ON ticker_mappings;
CREATE TRIGGER update_ticker_mappings_updated_at BEFORE UPDATE ON ticker_mappings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

3. Exit with `\q`.

After that, save mapping in the app should work.

---

## If you get: `column transition_results.updated_at does not exist`

This happens when running **Calculate** (transition). Your database was created before the `transition_results` table had an `updated_at` column. Add it in Cloud Shell:

1. Connect the same way (Steps 1–4 at the top).
2. At the `tat_database=>` prompt, run:

```sql
ALTER TABLE transition_results ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
UPDATE transition_results SET updated_at = created_at WHERE updated_at IS NULL;
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';
DROP TRIGGER IF EXISTS update_transition_results_updated_at ON transition_results;
CREATE TRIGGER update_transition_results_updated_at BEFORE UPDATE ON transition_results
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

3. Exit with `\q`.

After that, running Calculate (transition) should work.
