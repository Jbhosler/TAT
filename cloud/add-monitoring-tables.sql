-- Monitoring module tables: strategy name mappings, monitored accounts, snapshots, snapshot holdings
-- Run after init-db.sql (requires strategies table and asset_class_enum)

CREATE TABLE IF NOT EXISTS strategy_name_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_model_name VARCHAR(255) NOT NULL UNIQUE,
    internal_strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS monitored_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    synthetic_id VARCHAR(64) NOT NULL UNIQUE,
    friendly_name VARCHAR(255),
    internal_strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
    firm VARCHAR(255),
    advisor VARCHAR(255),
    account_display VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS account_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    monitored_account_id UUID NOT NULL REFERENCES monitored_accounts(id) ON DELETE CASCADE,
    as_of_date DATE NOT NULL,
    total_value NUMERIC(15, 2) NOT NULL,
    total_deviation_score NUMERIC(10, 3) NOT NULL,
    purity_score NUMERIC(5, 2) NOT NULL,
    cash_pct NUMERIC(5, 2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (monitored_account_id, as_of_date)
);

CREATE TABLE IF NOT EXISTS account_snapshot_holdings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_snapshot_id UUID NOT NULL REFERENCES account_snapshots(id) ON DELETE CASCADE,
    ticker VARCHAR(50) NOT NULL,
    asset_class VARCHAR(100),
    value NUMERIC(15, 2) NOT NULL,
    weight_pct NUMERIC(6, 3),
    grade INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_strategy_name_mappings_internal_strategy_id ON strategy_name_mappings(internal_strategy_id);
CREATE INDEX IF NOT EXISTS idx_monitored_accounts_synthetic_id ON monitored_accounts(synthetic_id);
CREATE INDEX IF NOT EXISTS idx_monitored_accounts_internal_strategy_id ON monitored_accounts(internal_strategy_id);
CREATE INDEX IF NOT EXISTS idx_account_snapshots_monitored_account_id ON account_snapshots(monitored_account_id);
CREATE INDEX IF NOT EXISTS idx_account_snapshots_as_of_date ON account_snapshots(as_of_date);
CREATE INDEX IF NOT EXISTS idx_account_snapshot_holdings_account_snapshot_id ON account_snapshot_holdings(account_snapshot_id);

CREATE TRIGGER update_strategy_name_mappings_updated_at BEFORE UPDATE ON strategy_name_mappings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_monitored_accounts_updated_at BEFORE UPDATE ON monitored_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_account_snapshots_updated_at BEFORE UPDATE ON account_snapshots
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_account_snapshot_holdings_updated_at BEFORE UPDATE ON account_snapshot_holdings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
