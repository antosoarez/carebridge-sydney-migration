-- Ensure profiles updates stream over realtime so the engagement bar reacts live
ALTER TABLE public.profiles REPLICA IDENTITY FULL;
DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- Backfill: recompute engagement for every client based on existing data
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT user_id FROM public.user_roles WHERE role = 'client'
  LOOP
    PERFORM public.recompute_client_progress(r.user_id);
  END LOOP;
END $$;