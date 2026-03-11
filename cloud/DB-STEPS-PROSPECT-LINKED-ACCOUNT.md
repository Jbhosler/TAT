# Database steps: link prospect scenarios to monitored accounts

Adds `monitored_account_id` to prospects so a scenario can be linked to an actual account once it's in the system.

**Prerequisites:** `add-monitoring-tables.sql` must be applied (creates `monitored_accounts`).

## Apply migration

**Local (PostgreSQL):**
```bash
psql "host=127.0.0.1 port=5432 user=postgres dbname=tat_database" -f cloud/add-prospect-linked-account.sql
```

**Cloud Shell:**
```bash
# From project root
psql "host=/cloudsql/YOUR_INSTANCE_CONNECTION_NAME user=postgres dbname=tat_database" -f cloud/add-prospect-linked-account.sql
```

## Verify

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'prospects' AND column_name = 'monitored_account_id';
```

You should see one row: `monitored_account_id`, `uuid`, `YES`.
