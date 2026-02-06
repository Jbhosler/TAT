-- Discovery module: bridge table for vendor model names and internal strategies.
-- Also adds external_model_name to monitored_accounts and is_unmapped to account_snapshots.

CREATE TABLE IF NOT EXISTS discovery_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_model_name VARCHAR(255) NOT NULL UNIQUE,
    internal_strategy_id UUID REFERENCES strategies(id) ON DELETE SET NULL,
    last_seen TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_discovery_models_external_model_name ON discovery_models(external_model_name);
CREATE INDEX IF NOT EXISTS idx_discovery_models_internal_strategy_id ON discovery_models(internal_strategy_id);

CREATE TRIGGER update_discovery_models_updated_at BEFORE UPDATE ON discovery_models
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Allow monitored_accounts without a strategy (unmapped models)
ALTER TABLE monitored_accounts ALTER COLUMN internal_strategy_id DROP NOT NULL;
ALTER TABLE monitored_accounts ADD COLUMN IF NOT EXISTS external_model_name VARCHAR(255);

-- Flag snapshots that have no strategy mapping (holdings stored but no deviation/purity computed)
ALTER TABLE account_snapshots ADD COLUMN IF NOT EXISTS is_unmapped BOOLEAN NOT NULL DEFAULT false;

-- Backfill discovery_models from existing strategy name mappings
INSERT INTO discovery_models (external_model_name, internal_strategy_id, last_seen, is_active)
SELECT external_model_name, internal_strategy_id, CURRENT_TIMESTAMP, true
FROM strategy_name_mappings
ON CONFLICT (external_model_name) DO NOTHING;

COMMENT ON TABLE discovery_models IS 'Bridge between vendor model names and internal strategies; tracks all models seen in ingest.';
COMMENT ON COLUMN monitored_accounts.external_model_name IS 'Vendor model name for discovery reporting.';
COMMENT ON COLUMN account_snapshots.is_unmapped IS 'True when account has no strategy mapping (snapshot stores value only).';
