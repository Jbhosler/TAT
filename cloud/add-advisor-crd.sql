-- Add advisor_crd to monitored_accounts (FINRA CRD from registration-type file).
-- Run after add-registration-type.sql on existing deployments.

ALTER TABLE monitored_accounts
ADD COLUMN IF NOT EXISTS advisor_crd VARCHAR(32) NULL;

COMMENT ON COLUMN monitored_accounts.advisor_crd IS 'FINRA CRD number from registration-type upload (adviser-level)';
