-- Store optional multi-strategy blend configuration on prospect scenarios.
-- When null, prospect uses strategy_id as a single target strategy.
-- When set: [{"strategy_id": "...", "weight": 60.0, "version": 3}, ...]

ALTER TABLE prospects ADD COLUMN IF NOT EXISTS strategy_blend JSONB;

COMMENT ON COLUMN prospects.strategy_blend IS 'Optional weighted blend of strategies; version captured at last calculate';

ALTER TABLE transition_results ADD COLUMN IF NOT EXISTS strategy_versions_snapshot JSONB;

COMMENT ON COLUMN transition_results.strategy_versions_snapshot IS 'Strategy id -> version at calculation time (single or blend)';

ALTER TABLE prospects ADD COLUMN IF NOT EXISTS strategy_account_links JSONB;

COMMENT ON COLUMN prospects.strategy_account_links IS 'Per-strategy monitored account links for blend scenarios';

ALTER TABLE transition_results ADD COLUMN IF NOT EXISTS target_positions JSONB;

COMMENT ON COLUMN transition_results.target_positions IS 'Target model portfolio snapshot at calculation (per model ticker)';
