-- Remove the broad advocate read access on emotion_logs so notes are never readable
DROP POLICY IF EXISTS "Advocates view emotion logs" ON public.emotion_logs;

-- Aggregated, note-free daily summary for a single client (used by the wave chart)
CREATE OR REPLACE FUNCTION public.get_client_emotion_summary(
  _client_id uuid,
  _days int DEFAULT 14
)
RETURNS TABLE(day date, emotion text, count int)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'advocate') THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  RETURN QUERY
    SELECT (el.created_at AT TIME ZONE 'UTC')::date AS day,
           el.emotion,
           COUNT(*)::int AS count
      FROM public.emotion_logs el
     WHERE el.user_id = _client_id
       AND el.created_at >= now() - make_interval(days => _days)
     GROUP BY 1, 2;
END;
$$;

-- Note-free per-row feed used to compute the 3-day low-mood flag on the advocate dashboard
CREATE OR REPLACE FUNCTION public.get_recent_low_mood_rows(_days int DEFAULT 7)
RETURNS TABLE(user_id uuid, emotion text, created_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'advocate') THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  RETURN QUERY
    SELECT el.user_id, el.emotion, el.created_at
      FROM public.emotion_logs el
     WHERE el.user_id IS NOT NULL
       AND el.created_at >= now() - make_interval(days => _days)
       AND el.emotion = ANY (ARRAY['sad','overwhelmed','anxious']);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_client_emotion_summary(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_recent_low_mood_rows(int) TO authenticated;