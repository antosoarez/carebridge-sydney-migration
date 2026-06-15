## Plan

I’ll create a new `sydney-bundle-v5.sql` that fixes the recurring `app_role already exists` error and keeps the previous realtime-publication fix.

## What will change

1. Replace enum creation wrappers like:

```sql
DO $mig$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM (...);
  END IF;
END $mig$;
```

with a safer wrapper that catches Postgres duplicate errors:

```sql
DO $mig$ BEGIN
  CREATE TYPE public.app_role AS ENUM (...);
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;
```

2. Apply that same pattern to all `CREATE TYPE public.* AS ENUM` blocks in the bundle, not just `app_role`, so the next existing enum does not fail after this one.

3. Preserve the previous v4 fix for:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE ...
```

so duplicate realtime subscriptions are still ignored.

4. Verify the generated SQL for:
   - no nested `DO $$ BEGIN` / `DO $mig$ BEGIN` around enum creation,
   - no raw unguarded `CREATE TYPE public.* AS ENUM`,
   - all realtime `ALTER PUBLICATION ... ADD TABLE` statements still wrapped with `duplicate_object` handling.

## Result

You’ll get a new downloadable artifact: `sydney-bundle-v5.sql`, then you can paste that into Supabase Sydney SQL Editor and run it.