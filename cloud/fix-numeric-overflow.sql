-- Fix "numeric field overflow" for target_allocation and drift_percentage.
-- NUMERIC(5,3) only allows up to 99.999; 100% needs NUMERIC(6,3).
-- Run once as a superuser (e.g. postgres) on tat_database.

ALTER TABLE strategy_positions
  ALTER COLUMN target_allocation TYPE NUMERIC(6, 3),
  ALTER COLUMN drift_percentage TYPE NUMERIC(6, 3);
