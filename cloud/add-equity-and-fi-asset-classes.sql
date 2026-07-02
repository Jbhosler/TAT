-- Add Infrastructure, Options Overlay, Real Estate (equity) and Bank Loan, Securitized (fixed income).
-- Run on existing databases that already have asset_class_enum.

ALTER TYPE asset_class_enum ADD VALUE IF NOT EXISTS 'Infrastructure';
ALTER TYPE asset_class_enum ADD VALUE IF NOT EXISTS 'Options Overlay';
ALTER TYPE asset_class_enum ADD VALUE IF NOT EXISTS 'Real Estate';
ALTER TYPE asset_class_enum ADD VALUE IF NOT EXISTS 'Bank Loan';
ALTER TYPE asset_class_enum ADD VALUE IF NOT EXISTS 'Securitized';
