-- Link prospect scenarios to monitored accounts (for scenarios that become live accounts).
-- Run after add-monitoring-tables.sql on existing deployments.

ALTER TABLE prospects ADD COLUMN IF NOT EXISTS monitored_account_id UUID REFERENCES monitored_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_prospects_monitored_account_id ON prospects(monitored_account_id);

COMMENT ON COLUMN prospects.monitored_account_id IS 'Linked monitored account when scenario is onboarded to the system';
