
-- =====================================================================
-- Security hardening migration: 4 targeted fixes
-- =====================================================================

-- ---------------------------------------------------------------------
-- FIX 4 (first, since it removes columns): move advocate-only
-- report-meta fields off public.profiles into a separate table that
-- clients have no SELECT access to.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.client_report_meta (
  client_id uuid PRIMARY KEY,
  report_progress smallint NOT NULL DEFAULT 0 CHECK (report_progress >= 0 AND report_progress <= 100),
  report_requested_from date,
  report_requested_to date,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.client_report_meta ENABLE ROW LEVEL SECURITY;

-- Only advocates can read/write this table. Clients have no policies
-- so they cannot see report_progress / requested window at all.
DROP POLICY IF EXISTS "Advocates manage report meta" ON public.client_report_meta;
CREATE POLICY "Advocates manage report meta"
ON public.client_report_meta
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'advocate'))
WITH CHECK (public.has_role(auth.uid(), 'advocate'));

-- Backfill from profiles for existing clients
INSERT INTO public.client_report_meta (client_id, report_progress, report_requested_from, report_requested_to)
SELECT p.id, p.report_progress, p.report_requested_from, p.report_requested_to
FROM public.profiles p
JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'client'
ON CONFLICT (client_id) DO NOTHING;

-- Drop the moved columns from profiles
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS report_progress,
  DROP COLUMN IF EXISTS report_requested_from,
  DROP COLUMN IF EXISTS report_requested_to;

-- Rewrite the advocate-field guard trigger to drop the moved fields
CREATE OR REPLACE FUNCTION public.guard_profile_advocate_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'advocate') THEN
    IF NEW.tier IS DISTINCT FROM OLD.tier
       OR NEW.report_status IS DISTINCT FROM OLD.report_status
       OR NEW.client_colour IS DISTINCT FROM OLD.client_colour
       OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
       OR NEW.client_progress IS DISTINCT FROM OLD.client_progress THEN
      RAISE EXCEPTION 'Only advocates can change tier, report_status, client_colour, payment_status, or client_progress';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Rewrite reset_report_progress to operate on the new table + profiles.report_status
CREATE OR REPLACE FUNCTION public.reset_report_progress(_client_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'advocate') THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  INSERT INTO public.client_report_meta (client_id, report_progress)
    VALUES (_client_id, 0)
    ON CONFLICT (client_id) DO UPDATE SET report_progress = 0, updated_at = now();
  UPDATE public.profiles SET report_status = 'updating' WHERE id = _client_id;
END;
$$;

-- Auto-touch updated_at on client_report_meta
CREATE OR REPLACE FUNCTION public.touch_client_report_meta()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS touch_client_report_meta_t ON public.client_report_meta;
CREATE TRIGGER touch_client_report_meta_t
BEFORE UPDATE ON public.client_report_meta
FOR EACH ROW EXECUTE FUNCTION public.touch_client_report_meta();

-- ---------------------------------------------------------------------
-- FIX 1: harden profiles UPDATE policy (defence in depth)
-- A client may UPDATE only safe columns; advocate-only fields must be
-- unchanged vs. the existing row.
-- ---------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  AND tier                 = (SELECT p.tier                FROM public.profiles p WHERE p.id = profiles.id)
  AND report_status        = (SELECT p.report_status       FROM public.profiles p WHERE p.id = profiles.id)
  AND client_colour        = (SELECT p.client_colour       FROM public.profiles p WHERE p.id = profiles.id)
  AND payment_status       = (SELECT p.payment_status      FROM public.profiles p WHERE p.id = profiles.id)
  AND client_progress      = (SELECT p.client_progress     FROM public.profiles p WHERE p.id = profiles.id)
  AND must_change_password = (SELECT p.must_change_password FROM public.profiles p WHERE p.id = profiles.id)
  AND activated_at IS NOT DISTINCT FROM (SELECT p.activated_at FROM public.profiles p WHERE p.id = profiles.id)
);

-- ---------------------------------------------------------------------
-- FIX 2: force report_comments.author_role server-side
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_report_comment_author_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.author_id := auth.uid();
  IF public.has_role(auth.uid(), 'advocate') THEN
    NEW.author_role := 'advocate';
  ELSIF public.has_role(auth.uid(), 'client') THEN
    NEW.author_role := 'client';
  ELSE
    RAISE EXCEPTION 'No valid role for commenter';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS report_comments_set_author ON public.report_comments;
CREATE TRIGGER report_comments_set_author
BEFORE INSERT ON public.report_comments
FOR EACH ROW EXECUTE FUNCTION public.set_report_comment_author_role();

-- ---------------------------------------------------------------------
-- FIX 3: REVOKE EXECUTE on internal SECURITY DEFINER functions
-- ---------------------------------------------------------------------

-- Trigger-only / internal functions: revoke from everyone
REVOKE ALL ON FUNCTION public.handle_new_user()                       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_profile_advocate_fields()         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_reports_updated_at()              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_client_report_meta()              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_recompute_appointments()            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_recompute_tasks()                   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_recompute_documents()               FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_report_comment_author_role()        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recompute_client_progress(uuid)         FROM PUBLIC, anon, authenticated;

-- Edge-function / service-role only
REVOKE ALL ON FUNCTION public.enqueue_email(text, jsonb)              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_email(text, bigint)              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb)  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.invalidate_user_auth_tokens(uuid)       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_delete_client(uuid)               FROM PUBLIC, anon, authenticated;

-- Client-callable RPCs: revoke from PUBLIC/anon, grant to authenticated
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role)                FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role)             TO authenticated;

REVOKE ALL ON FUNCTION public.bump_client_progress(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bump_client_progress(uuid, integer, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.set_report_stage_visibility(uuid, report_stage, report_visibility) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_report_stage_visibility(uuid, report_stage, report_visibility) TO authenticated;

REVOKE ALL ON FUNCTION public.share_report_for_review(uuid)           FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.share_report_for_review(uuid)        TO authenticated;

REVOKE ALL ON FUNCTION public.revert_report_to_draft(uuid)            FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revert_report_to_draft(uuid)         TO authenticated;

REVOKE ALL ON FUNCTION public.agree_report(uuid)                      FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agree_report(uuid)                   TO authenticated;

REVOKE ALL ON FUNCTION public.send_back_report(uuid, text)            FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_back_report(uuid, text)         TO authenticated;

REVOKE ALL ON FUNCTION public.reset_report_progress(uuid)             FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_report_progress(uuid)          TO authenticated;
