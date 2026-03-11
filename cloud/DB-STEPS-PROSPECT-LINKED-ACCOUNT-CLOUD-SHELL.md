# Add `monitored_account_id` to prospects – Cloud Shell (exact steps)

Use **Cloud Shell** in the browser. Follow each step in order.

**Prerequisites:** The `monitored_accounts` table must exist (from `add-monitoring-tables.sql`).

---

## Step 1: Open Google Cloud Console

1. In your browser, go to: **https://console.cloud.google.com**
2. Sign in with the Google account that has access to your project.

---

## Step 2: Open Cloud Shell

1. At the **top right** of the Cloud Console page, click the **terminal icon** ( `>_` ) in the toolbar.
2. A panel will open at the **bottom** with a terminal.
3. Wait until you see a prompt like:
   ```text
   username@cloudshell:~ (tax-aware-transition-tool)$
   ```

---

## Step 3: Set the correct project (if needed)

```bash
gcloud config set project tax-aware-transition-tool
```

*(Replace `tax-aware-transition-tool` with your project ID if different.)*

---

## Step 4: Connect to the database

```bash
gcloud sql connect tat-db-instance --user=postgres --database=tat_database
```

- **If prompted for a password:** Enter the postgres password. The cursor will not move as you type; that is normal. Press **Enter** when done.
- When connected, the prompt will change to:
  ```text
  tat_database=>
  ```

---

## Step 5: Run the migration SQL

At the `tat_database=>` prompt, paste this **exactly** (then press **Enter**):

```sql
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS monitored_account_id UUID REFERENCES monitored_accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_prospects_monitored_account_id ON prospects(monitored_account_id);
COMMENT ON COLUMN prospects.monitored_account_id IS 'Linked monitored account when scenario is onboarded to the system';
```

You should see:
```text
ALTER TABLE
CREATE INDEX
COMMENT
```

---

## Step 6: Exit the database connection

At the `tat_database=>` prompt:

```text
\q
```

You are back in the shell; the migration is done.

---

## Step 7 (optional): Verify the column exists

```bash
gcloud sql connect tat-db-instance --user=postgres --database=tat_database
```

*(Enter postgres password if prompted.)*

At `tat_database=>`:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'prospects' AND column_name = 'monitored_account_id';
```

You should see one row: `monitored_account_id`, `uuid`, `YES`.

Then exit:

```text
\q
```

---

## Quick copy-paste (Steps 4–6 only)

After Cloud Shell is open and the project is set (Steps 1–3):

```bash
gcloud sql connect tat-db-instance --user=postgres --database=tat_database
```

*(Enter postgres password when prompted.)*

Then at `tat_database=>`:

```sql
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS monitored_account_id UUID REFERENCES monitored_accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_prospects_monitored_account_id ON prospects(monitored_account_id);
COMMENT ON COLUMN prospects.monitored_account_id IS 'Linked monitored account when scenario is onboarded to the system';
\q
```

---

## If something doesn't match

- **Instance name:** If not `tat-db-instance`, run `gcloud sql instances list` and use the name from the list.
- **Database name:** If not `tat_database`, replace it in the `gcloud sql connect` command.
- **Project:** If not `tax-aware-transition-tool`, use your project ID in Step 3.
- **Error "relation monitored_accounts does not exist":** Run `add-monitoring-tables.sql` first.
