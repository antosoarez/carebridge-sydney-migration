DROP POLICY IF EXISTS "Anyone can submit a check-in" ON public.emotion_logs;

CREATE POLICY "Anyone can submit a check-in"
ON public.emotion_logs
FOR INSERT
TO anon, authenticated
WITH CHECK (
  char_length(emotion) BETWEEN 1 AND 40
  AND (optional_note IS NULL OR char_length(optional_note) <= 4000)
  AND (
    (auth.uid() IS NULL AND user_id IS NULL)
    OR (auth.uid() IS NOT NULL AND user_id = auth.uid())
  )
);