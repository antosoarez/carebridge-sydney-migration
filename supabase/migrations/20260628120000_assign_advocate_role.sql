-- Assign sole advocate role, tighten user_roles schema, and expose secure role helpers.
-- Idempotent: safe to run multiple times.

-- 1) Schema: updated_at + one role per user
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Remove duplicate role rows per user (prefer advocate over client)
DELETE FROM public.user_roles ur
WHERE ur.id IN (
  SELECT id
  FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY user_id
        ORDER BY
          CASE role WHEN 'advocate'::public.app_role THEN 0 ELSE 1 END,
          created_at ASC
      ) AS rn
    FROM public.user_roles
  ) ranked
  WHERE rn > 1
);

ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_user_id_role_key;

ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_user_id_key;

ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_user_id_key UNIQUE (user_id);

-- 2) Secure role lookup for the authenticated session (no arbitrary user_id parameter)
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ur.role
  FROM public.user_roles ur
  WHERE ur.user_id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_advocate()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'advocate'::public.app_role);
$$;

REVOKE ALL ON FUNCTION public.get_my_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_advocate() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_advocate() TO authenticated;

-- 3) RLS: advocates may read all role rows (for client lists); clients only their own
DROP POLICY IF EXISTS "Advocates can view all roles" ON public.user_roles;
CREATE POLICY "Advocates can view all roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'advocate'::public.app_role));

-- Deny insert/update/delete policies from 20260516151921 remain in force.

-- 4) Assign advocate to the existing auth user (does not create auth.users rows)
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'advocate'::public.app_role
FROM auth.users u
WHERE LOWER(u.email) = LOWER('hello@carebridgeperth.com')
ON CONFLICT (user_id)
DO UPDATE SET
  role = EXCLUDED.role,
  updated_at = NOW();

-- Sole advocate: demote any other advocate rows
UPDATE public.user_roles ur
SET
  role = 'client'::public.app_role,
  updated_at = NOW()
FROM auth.users au
WHERE ur.user_id = au.id
  AND ur.role = 'advocate'::public.app_role
  AND LOWER(au.email) <> LOWER('hello@carebridgeperth.com');

-- 5) New signups are always clients; advocate is assigned only via migration/service role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'client'::public.app_role)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.notification_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;
