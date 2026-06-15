# Plan: Aplicar el schema en Supabase Sydney sin terminal

## Objetivo
Generar **un único archivo SQL** (`/mnt/documents/sydney-bundle.sql`) que vos puedas:
1. Abrir / descargar desde el panel de artefactos.
2. Copiar todo el contenido.
3. Pegarlo en **Supabase Sydney → SQL Editor → New query**.
4. Apretar **Run** una sola vez.

No necesitás terminal, Node, ni Supabase CLI.

## Qué hace el script de generación
- Lista las 76 migraciones en `supabase/migrations/` en orden alfabético (que es también orden cronológico por el timestamp del nombre).
- Las concatena en un único `bundle.sql` separadas por una línea en blanco.
- Los `INSERT INTO storage.buckets` ya están incluidos dentro de dos migraciones existentes (`client-documents` y el segundo bucket), así que **no hay que agregar buckets aparte**: ya viajan en el bundle.
- Envuelve cada migración con un comentario `-- ===== file: <nombre> =====` por si algo falla y necesitamos identificar el punto (sin romper el formato "un solo archivo" que pediste — es solo un comentario SQL).

## Qué tenés que hacer vos (paso a paso, sin terminal)

1. Yo te genero el archivo y aparece como **artefacto descargable** en el chat.
2. Lo abrís / lo copiás (Ctrl/Cmd+A → Ctrl/Cmd+C).
3. Vas a https://supabase.com/dashboard/project/dkfjmtysfuqtdpaqpxsd/sql/new
4. Pegás todo, **Run**.
5. Esperás. Va a tardar 30-90 segundos.
6. Me pegás el resultado (éxito o el primer error que veas).

## Qué hacemos si falla
- Si un statement falla porque el objeto **ya existe** (ej. extensión `pgcrypto`): seguramente no es bloqueante, lo marcamos y seguimos.
- Si falla por **dependencia faltante** (ej. una función que referencia otra que aún no se creó): muy improbable porque las migraciones ya estaban en orden y se aplicaron así en Seoul, pero si pasa, identifico el archivo por el comentario `-- ===== file: ... =====` y armamos un fix puntual.
- Si falla a mitad: Supabase corre el bloque en una transacción implícita por statement, no por archivo, así que **lo que ya se creó queda**. Reintentar el bundle entero suele ser seguro porque la mayoría de los `CREATE` son idempotentes en este proyecto; si no, te paso un bundle "desde el punto X".

## Qué NO hace este plan
- No despliega las 25 Edge Functions (ese es el **paso 4**, separado — esas sí o sí necesitan CLI o que las pegues una por una en el Dashboard → Edge Functions; lo vemos después).
- No setea los secrets de las functions (RESEND_API_KEY, VAPID keys, etc.) — paso aparte cuando lleguemos a functions.
- No reconfigura los redirect URLs de Auth ni los email templates en Auth → eso es UI de Supabase, lo hacemos al final.

## Detalle técnico (para referencia)
- Input: `supabase/migrations/*.sql` (76 archivos).
- Output: `/mnt/documents/sydney-bundle.sql`.
- Comando aproximado:
  ```
  for f in supabase/migrations/*.sql (orden alfabético); do
    echo "-- ===== file: $f =====" >> bundle.sql
    cat $f >> bundle.sql
    echo "" >> bundle.sql
  done
  ```
- Tamaño esperado: ~300-800 KB de SQL (manejable para pegar en el editor).

## Siguiente paso después de aprobar
Paso a build mode, genero el archivo, te lo dejo como `<presentation-artifact>` descargable, y te confirmo el link.
