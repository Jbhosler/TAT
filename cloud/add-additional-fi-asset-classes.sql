-- Add additional fixed income asset classes.
-- Run on existing databases that already have asset_class_enum.

ALTER TYPE asset_class_enum ADD VALUE IF NOT EXISTS 'Variable Rate IG';
ALTER TYPE asset_class_enum ADD VALUE IF NOT EXISTS 'MBS Floating Rate';
ALTER TYPE asset_class_enum ADD VALUE IF NOT EXISTS 'CLO-AAA';
ALTER TYPE asset_class_enum ADD VALUE IF NOT EXISTS 'CLO-BBB';
ALTER TYPE asset_class_enum ADD VALUE IF NOT EXISTS 'CLO-A';
ALTER TYPE asset_class_enum ADD VALUE IF NOT EXISTS 'Commercial Paper';
