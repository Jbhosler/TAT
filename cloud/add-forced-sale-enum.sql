-- Add 'forced_sale' to mapping_status_enum for existing databases.
-- Run once as a superuser (e.g. postgres) if the enum already exists without 'forced_sale'.
-- Safe to run: adding an enum value that already exists will error; ignore or run in a DO block.

ALTER TYPE mapping_status_enum ADD VALUE IF NOT EXISTS 'forced_sale';
