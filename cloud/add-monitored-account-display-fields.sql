-- Add Firm, Advisor, and partial account (account_display) to monitored_accounts for drill-down display.
-- Run after add-monitoring-tables.sql on existing deployments.

ALTER TABLE monitored_accounts ADD COLUMN IF NOT EXISTS firm VARCHAR(255);
ALTER TABLE monitored_accounts ADD COLUMN IF NOT EXISTS advisor VARCHAR(255);
ALTER TABLE monitored_accounts ADD COLUMN IF NOT EXISTS account_display VARCHAR(255);

COMMENT ON COLUMN monitored_accounts.firm IS 'Firm from aggregated CSV (e.g. Cetera)';
COMMENT ON COLUMN monitored_accounts.advisor IS 'Advisor from aggregated CSV';
COMMENT ON COLUMN monitored_accounts.account_display IS 'Partial/masked account from CSV (e.g. ****5038)';
