-- Per-strategy monitored account links for blend scenarios (Envestnet: one account per strategy).
-- Example: [{"strategy_id": "...", "monitored_account_id": "..."}, ...]

ALTER TABLE prospects ADD COLUMN IF NOT EXISTS strategy_account_links JSONB;

COMMENT ON COLUMN prospects.strategy_account_links IS 'Links each target strategy to a funded monitored account';
