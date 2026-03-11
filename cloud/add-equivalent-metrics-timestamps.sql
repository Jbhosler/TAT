-- Add missing created_at and updated_at to equivalent_metrics (BaseModel columns)
-- Run if you already created equivalent_metrics without these columns

ALTER TABLE equivalent_metrics ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE equivalent_metrics ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
