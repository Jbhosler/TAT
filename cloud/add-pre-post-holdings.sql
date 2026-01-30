-- Add pre_holdings and post_holdings to transition_results for existing databases.
-- Run once as postgres (or superuser) if the columns are missing.
-- Safe: IF NOT EXISTS prevents error if columns already exist.
-- Existing rows will have NULL; re-run Calculate to populate.

ALTER TABLE transition_results ADD COLUMN IF NOT EXISTS pre_holdings JSONB;
ALTER TABLE transition_results ADD COLUMN IF NOT EXISTS post_holdings JSONB;
