-- Bootstrap advocate role after hello@carebridgeperth.com exists in auth.users.
-- Run in the Supabase SQL editor (service role / dashboard). Idempotent.
--
-- Prerequisites:
--   1. The auth user has signed up or been created in Supabase Auth.
--   2. Migration 20260628120000_assign_advocate_role.sql has been applied.
--
-- Verification:
--   SELECT au.id, au.email, ur.role
--   FROM auth.users au
--   LEFT JOIN public.user_roles ur ON ur.user_id = au.id
--   WHERE LOWER(au.email) = LOWER('hello@carebridgeperth.com');

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'advocate'::public.app_role
FROM auth.users u
WHERE LOWER(u.email) = LOWER('hello@carebridgeperth.com')
ON CONFLICT (user_id)
DO UPDATE SET
  role = EXCLUDED.role,
  updated_at = NOW();

-- Ensure sole advocate
UPDATE public.user_roles ur
SET
  role = 'client'::public.app_role,
  updated_at = NOW()
FROM auth.users au
WHERE ur.user_id = au.id
  AND ur.role = 'advocate'::public.app_role
  AND LOWER(au.email) <> LOWER('hello@carebridgeperth.com');
