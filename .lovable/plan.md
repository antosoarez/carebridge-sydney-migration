## Objetivo

Migrar el código de Carebridgeperth (Lovable Cloud, Seoul) a este proyecto Lovable apuntándolo a **tu Supabase propio en Sydney (ap-southeast-2)** para cumplir residencia de datos del Privacy Act AU. **Sin activar Lovable Cloud.**

## Credenciales Sydney (provistas)

- `VITE_SUPABASE_URL` = `https://dkfjmtysfuqtdpaqpxsd.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY` = `sb_publishable__1FuQ_cTlSa712zYh6QynA_R7WDRSSd`
- `VITE_SUPABASE_PROJECT_ID` = `dkfjmtysfuqtdpaqpxsd`

Estas tres son **publishable / públicas** (la URL y la publishable key se exponen al browser por diseño). Las pongo en `.env` del repo. El **service_role** queda fuera del repo y solo se usa en tu máquina para desplegar functions y migraciones.

---

## Paso 1 — Reemplazar el shell TanStack Start por el código original

Borrar del shell actual:
- `src/routes/`, `src/router.tsx`, `src/routeTree.gen.ts`, `src/server.ts`, `src/start.ts`
- `src/lib/error-capture.ts`, `src/lib/error-page.ts`, `src/lib/lovable-error-reporting.ts`, `src/lib/api/`, `src/lib/config.server.ts`
- `vite.config.ts`, `bunfig.toml`, `tsconfig.json`, `eslint.config.js`, `package.json`, `components.json`, `src/styles.css`, `.prettierrc`, `.prettierignore`

Copiar desde `/tmp/cb/` (excluyendo `.git` y `.workspace/.git`):
- `src/` completo (App.tsx, main.tsx, pages/, components/, hooks/, integrations/, lib/, assets/, test/, App.css, index.css, vite-env.d.ts)
- `public/` (logo, manifest, sw.js, sitemap, brand assets)
- `supabase/` (config.toml, migrations/, functions/) — viaja en el repo pero se despliega desde tu máquina con Supabase CLI, no desde Lovable
- `index.html`, `package.json`, `package-lock.json`, `vite.config.ts`, `tailwind.config.ts`, `postcss.config.js`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `eslint.config.js`, `components.json`, `vitest.config.ts`

`bun install` para resolver deps (react-router-dom 6, @supabase/supabase-js, etc.).

## Paso 2 — Apuntar a Supabase Sydney

1. Crear `.env` en la raíz con los 3 valores de arriba.
2. Leer `src/integrations/supabase/client.ts` del ZIP y, si tiene URL/publishable-key hardcodeadas de Lovable Cloud Seoul, reemplazar por lectura de `import.meta.env.VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`.
3. Auditar `src/integrations/supabase/types.ts` — se queda como está si el schema Seoul = Sydney (después de aplicar migraciones).
4. **No** activar Connectors → Supabase (riesgo de auto-provision de Lovable Cloud).

## Paso 3 — Migraciones SQL a Sydney (lo corrés vos)

Las 30+ migraciones en `supabase/migrations/` se aplican desde tu máquina:

```
supabase link --project-ref dkfjmtysfuqtdpaqpxsd
supabase db push
```

No lo corro yo desde el sandbox de Lovable porque eso requiere tu access token de Supabase y no debe vivir acá.

## Paso 4 — Edge Functions a Sydney (lo corrés vos)

Las 25 functions en `supabase/functions/` se despliegan desde tu máquina:

```
supabase functions deploy --project-ref dkfjmtysfuqtdpaqpxsd
```

Después configurás los secrets requeridos por cada function (`SUPABASE_SERVICE_ROLE_KEY`, SMTP, VAPID, etc.) con `supabase secrets set`. Te paso la lista completa cuando termine el Paso 1 y pueda leer cada `index.ts`.

## Paso 5 — Verificación

1. `bun run build` limpio.
2. Preview carga; Network tab muestra requests a `dkfjmtysfuqtdpaqpxsd.supabase.co` (Sydney), no Seoul.
3. Configurar en dashboard de Supabase Sydney: Site URL + Additional Redirect URLs apuntando al preview/publish de este proyecto.
4. Smoke tests manuales:
   - Signup + email verify
   - Login + MFA
   - **Crisis resources visibles sin auth / sin emotion state / sin flags** (no quedan gates del proyecto viejo)
   - Check-in 3 días sad/overwhelmed/anxious → low-mood flag privado en advocate dashboard, no expuesto al cliente
   - Paleta /check-in: navy `#1C2B3A` texto, sage `#8BA888` acentos, sin rojo

---

## Notas técnicas

**NO se hace:**
- Activar Lovable Cloud (irreversible, rompe residencia AU)
- Usar Connectors → Supabase de Lovable
- Crear Edge Functions en Lovable side
- Copiar `.git` del ZIP

**Riesgos:**
- Cliente Supabase del proyecto viejo puede tener URL Seoul hardcodeada → audito y forzo lectura de `import.meta.env`.
- Auth redirect URLs hay que reconfigurarlas en Supabase Sydney dashboard.
- Email templates de `auth-email-hook` hay que recrearlas en Supabase Sydney Auth → Email Templates.
- Si quisieras migrar data existente de Cloud Seoul, es un `pg_dump --data-only` aparte (paso opcional, lo discutimos después si hace falta).

**Stack final:** Vite 5 + React 18 + react-router-dom 6 + Supabase JS + shadcn/ui (idéntico al repo viejo).
