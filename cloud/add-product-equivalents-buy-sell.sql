-- Add buy_control, sell_control, custodian, notes, description to product_equivalents.
-- Make grade nullable for equivalents that need grade assigned in the app.

ALTER TABLE product_equivalents ADD COLUMN IF NOT EXISTS buy_control VARCHAR(100);
ALTER TABLE product_equivalents ADD COLUMN IF NOT EXISTS sell_control VARCHAR(100);
ALTER TABLE product_equivalents ADD COLUMN IF NOT EXISTS custodian VARCHAR(100);
ALTER TABLE product_equivalents ADD COLUMN IF NOT EXISTS notes VARCHAR(500);
ALTER TABLE product_equivalents ADD COLUMN IF NOT EXISTS description VARCHAR(500);

-- Make grade nullable: drop existing grade check, allow NULL, re-add check
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'product_equivalents'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE '%grade%'
    ) LOOP
        EXECUTE 'ALTER TABLE product_equivalents DROP CONSTRAINT ' || quote_ident(r.conname);
    END LOOP;
END $$;
ALTER TABLE product_equivalents ALTER COLUMN grade DROP NOT NULL;
ALTER TABLE product_equivalents ADD CONSTRAINT product_equivalents_grade_check
  CHECK (grade IS NULL OR grade IN (0, 1, 2));
