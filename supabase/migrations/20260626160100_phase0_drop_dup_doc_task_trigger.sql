-- =====================================================================
-- Phase 0.3: remove duplicate document-upload task trigger
-- ---------------------------------------------------------------------
-- Production has both:
--   * trg_document_uploaded     -> rule engine on_doc_uploaded ("Review document")
--   * trg_auto_task_doc_uploaded -> Lovable Phase-3 ("Review uploaded document")
-- Both fire on documents INSERT, creating two tasks per upload. Keep the rule
-- engine version (the backbone we are extending; it will gain notify actions in
-- Phase 1) and drop the standalone Lovable trigger.
-- =====================================================================

DROP TRIGGER IF EXISTS trg_auto_task_doc_uploaded ON public.documents;
