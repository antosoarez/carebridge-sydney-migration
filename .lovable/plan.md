# Fix v3 → v4: hacer idempotente `ALTER PUBLICATION ... ADD TABLE`

## Qué pasó

Postgres falla con `42710: relation "documents" is already member of publication "supabase_realtime"` cuando una migración hace:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.documents;
```

y la tabla ya está suscripta a realtime (lo agregaste en una corrida anterior, o Supabase la suscribió sola). No existe la variante `ADD TABLE IF NOT EXISTS` para publicaciones.

## Solución

Agrego una transformación más al script: envolver cada `ALTER PUBLICATION ... ADD TABLE ...;` en un `DO` block que ignora el error de duplicado:

```sql
DO $pub$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.documents;
EXCEPTION WHEN duplicate_object THEN NULL;
END $pub$;
```

Esto cubre todas las tablas que las migraciones suscribieron a realtime sin tener que listarlas a mano.

Regenero el archivo como `sydney-bundle-v4.sql`.

## Pasos para vos

1. Te paso `sydney-bundle-v4.sql`.
2. Pegalo en SQL Editor de Sydney → **Run**.
3. Decime si termina ✅ o si aparece otro error.
