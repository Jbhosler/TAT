-- Equivalent Review: store snapshots of ticker characteristics (returns, volatility, drawdown, correlation)
-- Run after init-db.sql (requires product_equivalents table)

CREATE TABLE IF NOT EXISTS equivalent_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    equivalent_id UUID NOT NULL REFERENCES product_equivalents(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Legacy ticker stats
    leg_ret_1y NUMERIC(10, 4),
    leg_ret_3y NUMERIC(10, 4),
    leg_ret_5y NUMERIC(10, 4),
    leg_vol NUMERIC(10, 4),
    leg_mdd NUMERIC(10, 4),
    -- Model ticker stats
    mod_ret_1y NUMERIC(10, 4),
    mod_ret_3y NUMERIC(10, 4),
    mod_ret_5y NUMERIC(10, 4),
    mod_vol NUMERIC(10, 4),
    mod_mdd NUMERIC(10, 4),
    -- Correlation between legacy and model
    correlation_1y NUMERIC(10, 4),
    UNIQUE (equivalent_id)
);

CREATE INDEX IF NOT EXISTS idx_equivalent_metrics_equivalent_id ON equivalent_metrics(equivalent_id);
