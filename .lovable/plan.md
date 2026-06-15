# Fix v2 → v3: dollar-tags únicos + dedup de DROP POLICY

## Qué pasó

En la migración `20260516163230_*` la sentencia `CREATE TYPE` ya venía envuelta por el autor original en:
```sql
DO $$ BEGIN
  CREATE TYPE public.document_visibility AS ENUM ('shared','advocate_private');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
```

Mi script v2 detectó el `CREATE TYPE` adentro y le metió OTRO `DO $$ ... END $$` encima. Resultado: dos `$$` anidados con el mismo tag, que Postgres lee como cierre prematuro → `syntax error at or near "BEGIN"`.

Además v2 generó líneas duplicadas de `DROP POLICY IF EXISTS` cuando la migración original ya traía una.

## Solución

Regenero `sydney-bundle-v3.sql` con dos ajustes al script:

1. **Dollar-quote único para el wrapper**: uso `DO $mig$ BEGIN ... END $mig$;` en lugar de `$$`. Así, si el `CREATE TYPE` ya estaba dentro de un `DO $$`, los tags no chocan y queda anidado válidamente.
2. **Dedup de DROP POLICY consecutivos**: tras aplicar las transformaciones, colapso pares idénticos de `DROP POLICY IF EXISTS ... ON ...;` consecutivos.
3. **Bonus**: lo mismo para `DROP TRIGGER IF EXISTS` consecutivos (por las dudas).

El resto del bundle se mantiene igual (CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, ON CONFLICT en buckets, etc.).

## Pasos para vos

1. Te entrego `sydney-bundle-v3.sql`.
2. Pegalo en el SQL Editor de Sydney → **Run**.
3. Avisame si termina ✅ o si aparece otro error (con número de línea si podés).
