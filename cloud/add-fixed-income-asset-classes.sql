-- Add fixed income asset class subclasses to existing databases.
-- Run this migration on databases that already have asset_class_enum.
-- PostgreSQL: ALTER TYPE ... ADD VALUE cannot run inside a transaction block in some contexts.

ALTER TYPE asset_class_enum ADD VALUE IF NOT EXISTS 'Emg Bond LC';
ALTER TYPE asset_class_enum ADD VALUE IF NOT EXISTS 'Emg Bond Hedged';
ALTER TYPE asset_class_enum ADD VALUE IF NOT EXISTS 'ST Corp';
ALTER TYPE asset_class_enum ADD VALUE IF NOT EXISTS 'IT Corp';
ALTER TYPE asset_class_enum ADD VALUE IF NOT EXISTS 'LT Corp';
ALTER TYPE asset_class_enum ADD VALUE IF NOT EXISTS 'ST Govt';
ALTER TYPE asset_class_enum ADD VALUE IF NOT EXISTS 'IT Govt';
ALTER TYPE asset_class_enum ADD VALUE IF NOT EXISTS 'LT Govt';
ALTER TYPE asset_class_enum ADD VALUE IF NOT EXISTS 'Tactical Cash';
ALTER TYPE asset_class_enum ADD VALUE IF NOT EXISTS 'Ultra ST Bond';
ALTER TYPE asset_class_enum ADD VALUE IF NOT EXISTS 'Aggregate';
ALTER TYPE asset_class_enum ADD VALUE IF NOT EXISTS 'Mortgage Backed';
ALTER TYPE asset_class_enum ADD VALUE IF NOT EXISTS 'Inflation Protection';
ALTER TYPE asset_class_enum ADD VALUE IF NOT EXISTS 'ST High Yield';
ALTER TYPE asset_class_enum ADD VALUE IF NOT EXISTS 'High Yield';
ALTER TYPE asset_class_enum ADD VALUE IF NOT EXISTS 'Private Credit';
ALTER TYPE asset_class_enum ADD VALUE IF NOT EXISTS 'Cash';
