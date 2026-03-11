-- Add registration_type to monitored_accounts (Retirement, Taxable, Trust)
-- Run after add-monitoring-tables.sql

ALTER TABLE monitored_accounts
ADD COLUMN IF NOT EXISTS registration_type VARCHAR(50) NULL;

COMMENT ON COLUMN monitored_accounts.registration_type IS 'Account registration type: Retirement, Taxable, or Trust';
