# Fix: bundle SQL idempotente

## Qué pasó

El error `42710: type "app_role" already exists` significa que el proyecto Sydney **ya tiene parte del schema creado** (de una corrida anterior parcial, o de un intento previo). Postgres corta en el primer `CREATE TYPE` que choca, aunque el resto del bundle estaría OK.

## Solución

Voy a regenerar `sydney-bundle.sql` envolviendo las sentencias que fallan si el objeto ya existe, para que se pueda correr cuantas veces haga falta sin romper.

### Transformaciones que aplico al bundle

1. **`CREATE TYPE ... AS ENUM (...)`** → envuelto en `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='...') THEN ... END IF; END $$;`
2. **`CREATE TABLE ...`** → `CREATE TABLE IF NOT EXISTS ...`
3. **`CREATE INDEX ...`** → `CREATE INDEX IF NOT EXISTS ...`
4. **`CREATE POLICY ...`** → precedido por `DROP POLICY IF EXISTS ... ON ...;` (las policies no soportan IF NOT EXISTS en versiones viejas)
5. **`CREATE TRIGGER ...`** → precedido por `DROP TRIGGER IF EXISTS ... ON ...;`
6. **`CREATE OR REPLACE FUNCTION`** → ya es idempotente, lo dejo
7. **`INSERT INTO storage.buckets`** → agrego `ON CONFLICT (id) DO NOTHING`
8. **`ALTER TABLE ... ADD COLUMN`** → cambio a `ADD COLUMN IF NOT EXISTS`
9. **`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`** → ya es idempotente, lo dejo
10. **`GRANT ...`** → ya es idempotente, lo dejo

### Pasos que vas a hacer vos

1. Te entrego el archivo nuevo: `sydney-bundle-v2.sql`.
2. Lo pegás en Supabase Sydney → SQL Editor → New query → **Run**.
3. Esperás 30-90 seg y me decís si terminó en ✅ Success o si aparece otro error.

Si aparece otro error específico (algo que no se cubre con los patrones de arriba), lo ajusto puntualmente y te paso una `v3`.

### Notas técnicas

- El bundle se procesa con un script Python que aplica las regex de transformación archivo por archivo, preservando el orden cronológico y los comentarios `-- ===== file: ... =====`.
- Si en algún momento querés "empezar de cero" en Sydney, hay otra opción: borrar el schema `public` y recrearlo (`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`). **No lo recomiendo** si ya hay data importada o si auth/storage tienen tablas propias — el bundle idempotente es más seguro.
