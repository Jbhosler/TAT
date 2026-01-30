-- Add updated_at to transition_results for existing databases.
-- Run once as postgres (or superuser) if the column is missing.
-- Safe: IF NOT EXISTS prevents error if column already exists.

ALTER TABLE transition_results ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

UPDATE transition_results SET updated_at = created_at WHERE updated_at IS NULL;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_transition_results_updated_at ON transition_results;
CREATE TRIGGER update_transition_results_updated_at BEFORE UPDATE ON transition_results
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
