-- Run against tat_database (e.g. Cloud SQL). Adds equivalent_usage JSONB to transition_results.
ALTER TABLE transition_results
  ADD COLUMN IF NOT EXISTS equivalent_usage JSONB DEFAULT '[]'::jsonb;
