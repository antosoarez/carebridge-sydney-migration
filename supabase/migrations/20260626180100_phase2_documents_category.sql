-- =====================================================================
-- Phase 2 (Gap E): document categories
-- ---------------------------------------------------------------------
-- Add a category to uploaded documents so clients can label health records
-- (pathology, imaging, specialist letters, etc.). Nullable so existing rows
-- are unaffected; the client upload UI sets it on new uploads.
-- =====================================================================

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS category text
  CHECK (category IS NULL OR category IN (
    'pathology','imaging','specialist_letter','referral','discharge',
    'prescription','myhealth','report','other'
  ));
