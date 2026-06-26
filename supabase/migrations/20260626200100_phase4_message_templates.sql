-- =====================================================================
-- Phase 4 (Gap I): message_templates copy library
-- ---------------------------------------------------------------------
-- Advocate-editable source of truth for engagement/notification copy.
-- The outbox dispatcher renders the branded email via TS templates keyed by
-- the same slug; this table holds the editable plain copy + {{client_name}}
-- placeholders the advocate can tweak. RLS: advocate read/update only.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  body_template text NOT NULL,
  category text,
  auto_trigger text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.message_templates TO authenticated;
GRANT ALL ON public.message_templates TO service_role;
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "advocates read templates" ON public.message_templates;
CREATE POLICY "advocates read templates" ON public.message_templates
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'advocate'));
DROP POLICY IF EXISTS "advocates update templates" ON public.message_templates;
CREATE POLICY "advocates update templates" ON public.message_templates
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'advocate'))
  WITH CHECK (public.has_role(auth.uid(), 'advocate'));

INSERT INTO public.message_templates (slug, title, body_template, category, auto_trigger) VALUES
('greeting_new', 'Welcome message',
 'Hi {{client_name}}, welcome to CareBridge! I''m Antonella, your health navigator. I''ve reviewed your intake and I''m ready to get started. If you have any questions, message me anytime.', 'greeting', NULL),
('mood_sad_3days', 'Mood check-in (3 days low)',
 'Hi {{client_name}}, I noticed you''ve been feeling a bit low for the past few days. Just checking in — is there anything I can help with? Remember, you''re not alone in this. 🌊', 'mood', 'mood_sad_3days'),
('reminder_gentle_7', 'Gentle task reminder (7 days)',
 'Hi {{client_name}}, just a gentle reminder — you have some tasks that are waiting for you in the app. No pressure, but completing them helps us move your care forward. Take it one step at a time. 🌊', 'reminder', 'task_overdue_7'),
('reminder_firm_14', 'Firmer reminder (14 days)',
 'Hi {{client_name}}, I noticed some tasks have been pending for a couple of weeks. I know life gets busy, but these steps are important for your care journey. Can we chat about what''s getting in the way?', 'reminder', 'task_overdue_14'),
('reminder_daily_21', 'Daily reminder (21+ days)',
 'Hi {{client_name}} 🌊 Remember to take care of your health today. Your tasks are waiting for you in the app — even one small step makes a difference.', 'reminder', 'task_overdue_21'),
('post_consultation', 'Post-consultation follow-up',
 'Hi {{client_name}}, thank you for today''s consultation. I''ll be working on your report and you''ll receive it soon. If you need to share any additional documents, you can upload them in the app anytime.', 'follow_up', NULL),
('report_ready', 'Report delivered',
 'Hi {{client_name}}, your CareBridge report is ready! You can view and download it in your Documents section. This report is designed to share with your treating doctor. Don''t forget to book your free follow-up call! 🌊', 'follow_up', NULL)
ON CONFLICT (slug) DO NOTHING;
