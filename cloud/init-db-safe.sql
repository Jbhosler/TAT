-- Initial database schema for Tax-Aware Transition Tool (Safe Version)
-- This version handles errors gracefully and uses more compatible syntax

-- Enable required extensions (if not already enabled)
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";
EXCEPTION
    WHEN OTHERS THEN
        -- Extension might not be available, continue anyway
        NULL;
END $$;

-- Drop existing types if they exist (for clean reinstall)
DROP TYPE IF EXISTS asset_class_enum CASCADE;
DROP TYPE IF EXISTS mapping_status_enum CASCADE;

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
    'multi_asset'
);

-- Drop existing tables if they exist (for clean reinstall)
DROP TABLE IF EXISTS transition_results CASCADE;
DROP TABLE IF EXISTS ticker_mappings CASCADE;
DROP TABLE IF EXISTS prospect_holdings CASCADE;
DROP TABLE IF EXISTS prospects CASCADE;
DROP TABLE IF EXISTS product_equivalents CASCADE;
DROP TABLE IF EXISTS strategy_positions CASCADE;
DROP TABLE IF EXISTS strategies CASCADE;

-- Create tables
CREATE TABLE strategies (
    id UUID PRIMARY KEY DEFAULT (md5(random()::text || clock_timestamp()::text)::uuid),
    name VARCHAR(255) NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE strategy_positions (
    id UUID PRIMARY KEY DEFAULT (md5(random()::text || clock_timestamp()::text)::uuid),
    strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
    model_ticker VARCHAR(50) NOT NULL,
    asset_class asset_class_enum NOT NULL,
    target_allocation NUMERIC(6, 3) NOT NULL,
    drift_percentage NUMERIC(6, 3) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE product_equivalents (
    id UUID PRIMARY KEY DEFAULT (md5(random()::text || clock_timestamp()::text)::uuid),
    strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
    legacy_ticker VARCHAR(50) NOT NULL,
    model_ticker VARCHAR(50) NOT NULL,
    grade INTEGER NOT NULL CHECK (grade IN (0, 1, 2)),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE prospects (
    id UUID PRIMARY KEY DEFAULT (md5(random()::text || clock_timestamp()::text)::uuid),
    strategy_id UUID NOT NULL REFERENCES strategies(id),
    name VARCHAR(255) NOT NULL,
    total_value NUMERIC(15, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE prospect_holdings (
    id UUID PRIMARY KEY DEFAULT (md5(random()::text || clock_timestamp()::text)::uuid),
    prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
    ticker VARCHAR(50) NOT NULL,
    value NUMERIC(15, 2) NOT NULL,
    unrealized_gain_loss NUMERIC(15, 2) NOT NULL,
    is_side_pocket BOOLEAN NOT NULL DEFAULT FALSE,
    mapping_status mapping_status_enum NOT NULL DEFAULT 'unmapped',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE ticker_mappings (
    id UUID PRIMARY KEY DEFAULT (md5(random()::text || clock_timestamp()::text)::uuid),
    prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
    legacy_ticker VARCHAR(50) NOT NULL,
    model_ticker VARCHAR(50) NOT NULL,
    grade INTEGER NOT NULL CHECK (grade IN (0, 1, 2)),
    dollar_split JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE transition_results (
    id UUID PRIMARY KEY DEFAULT (md5(random()::text || clock_timestamp()::text)::uuid),
    prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
    strategy_version INTEGER NOT NULL,
    sell_orders JSONB NOT NULL,
    buy_orders JSONB NOT NULL,
    cash_residual NUMERIC(15, 2) NOT NULL,
    total_realized_gain_loss NUMERIC(15, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_strategy_positions_strategy_id ON strategy_positions(strategy_id);
CREATE INDEX idx_product_equivalents_strategy_id ON product_equivalents(strategy_id);
CREATE INDEX idx_prospects_strategy_id ON prospects(strategy_id);
CREATE INDEX idx_prospect_holdings_prospect_id ON prospect_holdings(prospect_id);
CREATE INDEX idx_ticker_mappings_prospect_id ON ticker_mappings(prospect_id);
CREATE INDEX idx_transition_results_prospect_id ON transition_results(prospect_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS update_strategies_updated_at ON strategies;
DROP TRIGGER IF EXISTS update_strategy_positions_updated_at ON strategy_positions;
DROP TRIGGER IF EXISTS update_product_equivalents_updated_at ON product_equivalents;
DROP TRIGGER IF EXISTS update_prospects_updated_at ON prospects;
DROP TRIGGER IF EXISTS update_prospect_holdings_updated_at ON prospect_holdings;

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
