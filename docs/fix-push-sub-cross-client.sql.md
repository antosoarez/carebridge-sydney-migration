# Fix: push_subscriptions cross-client exposure

Run against the canonical Sydney project (`dkfjmtysfuqtdpaqpxsd`) via
`supabase db push` after dropping this into `supabase/migrations/`:

```sql
-- 20260629000000_fix_push_sub_cross_client.sql
-- Removes overly-permissive RLS policies on push_subscriptions that exposed
-- every user's Web Push endpoint URL and p256dh/auth crypto keys to any
-- authenticated session, and allowed any authenticated user to UPDATE
-- (hijack) another user's row.
--
-- The SECURITY DEFINER `upsert_my_push_subscription` function already
-- handles endpoint-conflict resolution, so these broad policies are
-- redundant. Owner-scoped policies ("Users select own push subs" /
-- "Users insert own push subs") remain in place for normal client use.

DROP POLICY IF EXISTS "Signed-in users can resolve push endpoint conflicts" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Signed-in users can claim push endpoint" ON public.push_subscriptions;
```
