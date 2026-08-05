-- Track whether side-pocket classification has been explicitly reviewed.
-- Existing prospects are treated as reviewed to preserve their current workflow.
ALTER TABLE prospects
    ADD COLUMN IF NOT EXISTS classification_completed BOOLEAN;

UPDATE prospects
SET classification_completed = TRUE
WHERE classification_completed IS NULL;

ALTER TABLE prospects
    ALTER COLUMN classification_completed SET DEFAULT FALSE,
    ALTER COLUMN classification_completed SET NOT NULL;
