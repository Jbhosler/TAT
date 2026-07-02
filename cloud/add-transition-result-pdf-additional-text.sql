-- Store optional adviser-entered PDF narrative with each transition result.
ALTER TABLE transition_results
ADD COLUMN IF NOT EXISTS pdf_additional_text TEXT NULL;
