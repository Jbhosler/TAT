-- Add document_pdf and document_filename to prospects for PDF attachment.
-- Run once as postgres (or superuser) if the columns are missing.
-- Safe: IF NOT EXISTS prevents error if columns already exist.

ALTER TABLE prospects ADD COLUMN IF NOT EXISTS document_pdf BYTEA;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS document_filename VARCHAR(255);
