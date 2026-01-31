-- Add cash_pct (cash as % of account value) to account_snapshots for heat map display.
-- Run on existing deployments that already have account_snapshots.

ALTER TABLE account_snapshots ADD COLUMN IF NOT EXISTS cash_pct NUMERIC(5, 2);

COMMENT ON COLUMN account_snapshots.cash_pct IS 'Cash as percentage of total account value (set at ingest)';
