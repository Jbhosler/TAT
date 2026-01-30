# Add `pre_holdings` and `post_holdings` – Cloud Shell (specific steps)

Use **Cloud Shell** in the browser. Follow each step in order.

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
   The `(tax-aware-transition-tool)` is your current project. If you see a different project name, do Step 3 to set the project.

---

## Step 3: Set the correct project (if needed)

1. In the Cloud Shell terminal, type (then press **Enter**):
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

1. At the `tat_database=>` prompt, type or paste this **exactly** (then press **Enter** after each line, or paste both lines and press **Enter** once):

   ```sql
   ALTER TABLE transition_results ADD COLUMN IF NOT EXISTS pre_holdings JSONB;
   ALTER TABLE transition_results ADD COLUMN IF NOT EXISTS post_holdings JSONB;
   ```

2. You should see:
   ```text
   ALTER TABLE
   ALTER TABLE
   ```
   That means the two columns were added (or they already existed and nothing changed).

3. If you see an error instead, check that you are in the right project and database and that the table name is `transition_results`.

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

## Step 7 (optional): Confirm the columns exist

1. Connect again (same as Step 4):
   ```bash
   gcloud sql connect tat-db-instance --user=postgres --database=tat_database
   ```
2. Enter the postgres password if prompted.
3. At the `tat_database=>` prompt, run:
   ```sql
   SELECT column_name, data_type, is_nullable
   FROM information_schema.columns
   WHERE table_name = 'transition_results'
     AND column_name IN ('pre_holdings', 'post_holdings');
   ```
4. You should see two rows: `pre_holdings` and `post_holdings`, both `jsonb`, nullable.
5. Exit again:
   ```text
   \q
   ```

---

## If something doesn’t match

- **Instance name:** If your instance is not `tat-db-instance`, run:
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
ALTER TABLE transition_results ADD COLUMN IF NOT EXISTS pre_holdings JSONB;
ALTER TABLE transition_results ADD COLUMN IF NOT EXISTS post_holdings JSONB;
\q
```

That’s the full migration.

---

## After the migration

- **Existing transition results** will have `pre_holdings` and `post_holdings` as `NULL`. The app will show a fallback message and the previous post-trades table.
- **New calculations:** Run **Calculate** again for a prospect; the new result will have both columns populated, and the Tax Summary will show the full pre vs post comparison by asset class.
