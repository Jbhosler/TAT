-- Initial database schema for Tax-Aware Transition Tool
-- Run this after creating the Cloud SQL instance

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enum types
CREATE TYPE asset_class_enum AS ENUM (
    'US Large Core',
    'US Large Growth',
    'US Large Value',
    'US Midcap Growth',
    'US Midcap Value',
    'US Small Cap',
    'International Developed',
    'Emerging Markets',
    'Fixed Income',
    'CASH'
);

CREATE TYPE mapping_status_enum AS ENUM (
    'mapped',
    'unmapped',
    'multi_asset',
    'forced_sale'
);

-- Create tables
CREATE TABLE IF NOT EXISTS strategies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS strategy_positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
    model_ticker VARCHAR(50) NOT NULL,
    asset_class asset_class_enum NOT NULL,
    target_allocation NUMERIC(6, 3) NOT NULL,
    drift_percentage NUMERIC(6, 3) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_equivalents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
    legacy_ticker VARCHAR(50) NOT NULL,
    model_ticker VARCHAR(50) NOT NULL,
    grade INTEGER NOT NULL CHECK (grade IN (0, 1, 2)),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS prospects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    strategy_id UUID NOT NULL REFERENCES strategies(id),
    name VARCHAR(255) NOT NULL,
    total_value NUMERIC(15, 2) NOT NULL,
    document_pdf BYTEA,
    document_filename VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS prospect_holdings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
    ticker VARCHAR(50) NOT NULL,
    value NUMERIC(15, 2) NOT NULL,
    unrealized_gain_loss NUMERIC(15, 2) NOT NULL,
    is_side_pocket BOOLEAN NOT NULL DEFAULT FALSE,
    mapping_status mapping_status_enum NOT NULL DEFAULT 'unmapped',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ticker_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
    legacy_ticker VARCHAR(50) NOT NULL,
    model_ticker VARCHAR(50) NOT NULL,
    grade INTEGER NOT NULL CHECK (grade IN (0, 1, 2)),
    dollar_split JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transition_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
    strategy_version INTEGER NOT NULL,
    sell_orders JSONB NOT NULL,
    buy_orders JSONB NOT NULL,
    cash_residual NUMERIC(15, 2) NOT NULL,
    total_realized_gain_loss NUMERIC(15, 2) NOT NULL,
    pre_holdings JSONB,
    post_holdings JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_strategy_positions_strategy_id ON strategy_positions(strategy_id);
CREATE INDEX IF NOT EXISTS idx_product_equivalents_strategy_id ON product_equivalents(strategy_id);
CREATE INDEX IF NOT EXISTS idx_prospects_strategy_id ON prospects(strategy_id);
CREATE INDEX IF NOT EXISTS idx_prospect_holdings_prospect_id ON prospect_holdings(prospect_id);
CREATE INDEX IF NOT EXISTS idx_ticker_mappings_prospect_id ON ticker_mappings(prospect_id);
CREATE INDEX IF NOT EXISTS idx_transition_results_prospect_id ON transition_results(prospect_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_strategies_updated_at BEFORE UPDATE ON strategies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_strategy_positions_updated_at BEFORE UPDATE ON strategy_positions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_product_equivalents_updated_at BEFORE UPDATE ON product_equivalents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_prospects_updated_at BEFORE UPDATE ON prospects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_prospect_holdings_updated_at BEFORE UPDATE ON prospect_holdings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ticker_mappings_updated_at BEFORE UPDATE ON ticker_mappings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_transition_results_updated_at BEFORE UPDATE ON transition_results
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Grant app user access (run as postgres/superuser; replace tat_user if different)
GRANT USAGE ON SCHEMA public TO tat_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO tat_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO tat_user;
GRANT USAGE ON TYPE asset_class_enum TO tat_user;
GRANT USAGE ON TYPE mapping_status_enum TO tat_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tat_user;
