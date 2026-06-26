
CREATE TABLE public.emotion_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NULL,
  emotion TEXT NOT NULL,
  optional_note TEXT NULL,
  user_agent TEXT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT emotion_logs_emotion_check CHECK (char_length(emotion) BETWEEN 1 AND 40),
  CONSTRAINT emotion_logs_note_check CHECK (optional_note IS NULL OR char_length(optional_note) <= 4000)
);

ALTER TABLE public.emotion_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit a check-in"
ON public.emotion_logs
FOR INSERT
TO anon, authenticated
WITH CHECK (
  char_length(emotion) BETWEEN 1 AND 40
  AND (optional_note IS NULL OR char_length(optional_note) <= 4000)
);

CREATE POLICY "Advocates view emotion logs"
ON public.emotion_logs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'advocate'::public.app_role));

CREATE POLICY "Advocates update emotion logs"
ON public.emotion_logs
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'advocate'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'advocate'::public.app_role));

CREATE POLICY "Advocates delete emotion logs"
ON public.emotion_logs
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'advocate'::public.app_role));

CREATE INDEX idx_emotion_logs_created_at ON public.emotion_logs (created_at DESC);
