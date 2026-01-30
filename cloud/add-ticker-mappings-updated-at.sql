-- Add updated_at to ticker_mappings for existing databases.
-- Run once as postgres (or superuser) if the column is missing.
-- Safe: IF NOT EXISTS prevents error if column already exists.

-- Add column (PostgreSQL 9.5+)
ALTER TABLE ticker_mappings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Ensure existing rows have a value
UPDATE ticker_mappings SET updated_at = created_at WHERE updated_at IS NULL;

-- Trigger function (idempotent)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger (drop first if re-running; then create)
DROP TRIGGER IF EXISTS update_ticker_mappings_updated_at ON ticker_mappings;
CREATE TRIGGER update_ticker_mappings_updated_at BEFORE UPDATE ON ticker_mappings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
