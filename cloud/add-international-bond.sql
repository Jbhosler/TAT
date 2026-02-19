-- Add International Bond asset class to existing databases.
-- Run this if you already ran add-fixed-income-asset-classes.sql and need to add this new value.

ALTER TYPE asset_class_enum ADD VALUE IF NOT EXISTS 'International Bond';
