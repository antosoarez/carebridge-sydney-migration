### 1. Stack Tecnológico y Arquitectura

+ **Frontend:** React + TypeScript; bundling con Vite. UI: Tailwind CSS (shadcn/ui patterns). Routing: React Router DOM. Tests: Vitest. Linter: ESLint. (Repo usa Bun como gestor; scripts en package.json.)
+ **Integración con Supabase:** `@supabase/supabase-js` inicializado en `src/integrations/supabase/client.ts` con `createClient<Database>(VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { storage: localStorage, persistSession: true, autoRefreshToken: true } })`.
+ **Estado / caché:** No hay Redux/Zustand/React Query central; la app usa React Context para sesión (`src/lib/auth.tsx`) y pequeños hooks/modulos locales (`src/lib/*-store.ts`) para estado y persistencia (localStorage) cuando aplica.

### 2. Esquema de Base de Datos y Seguridad (Supabase)

**Tablas Core (resumen):**
+ `profiles`: id (uuid PK → auth.users.id), email, full_name, activated_at, must_change_password, onboarding_completed_at, agreements_completed_at, payment_completed_at, intake_completed_at, client_progress, urgency_score, timestamps. Contiene flags de gating/onboarding y metadatos del usuario.
+ `user_roles`: id, user_id (auth.users), role (enum `advocate|client`), created_at, updated_at. Helper `public.has_role()` y RPC `public.get_my_role()` para consultas seguras del rol de la sesión.
+ `message_threads`: id, client_id, advocate_id, created_at, last_message_at. Hilos 1:1, UNIQUE (client_id, advocate_id).
+ `messages`: id, thread_id (FK → message_threads.id), sender_id, sender_role, body, created_at, read_at.

**Relaciones:**
+ Un `message_thread` conecta `client_id` ↔ `advocate_id`. `messages.thread_id` referencia `message_threads.id`. Los mensajes contienen `sender_id` y `sender_role` que se fijan desde el servidor.

**Seguridad (RLS) — modelo resumido:**
+ `profiles` y `user_roles` usan políticas RLS: clientes sólo leen su propio perfil/role; advocates pueden listar según políticas. `get_my_role()` evita exponer consultas arbitrarias por ID.
+ `message_threads`: clientes sólo pueden SELECT sus hilos; advocates pueden ver todos. Inserts/updates/deletes restringidos a advocates según políticas.
+ `messages`: RLS garantiza que clientes/advocates sólo puedan insertar/seleccionar mensajes para hilos donde son participantes. No hay políticas de UPDATE/DELETE (denegado por defecto).

**Lógica en BD (triggers / RPCs críticos):**
+ `set_message_sender_role()` (trigger BEFORE INSERT en `messages`): la BD sobrescribe `NEW.sender_id := auth.uid()` y setea `sender_role` consultando `public.has_role(...)`. Resultado: inmutabilidad y autenticidad del remitente desde servidor.
+ `bump_thread_last_message_at()` (AFTER INSERT en `messages`): actualiza `message_threads.last_message_at` al timestamp del nuevo mensaje.
+ `ensure_message_thread_for_client(_client_id)` + trigger en `profiles.activated_at`: creación perezosa (lazy) de hilo entre client y el primer advocate disponible; también existe backfill.
+ RPCs expuestos a `authenticated`: `get_my_role()`, `is_advocate()`. Estas sirven para evitar consultas inseguras desde cliente.

### 3. Autenticación, Roles y Ruteo (El "Client Journey")

+ **Gestión de sesión:** `AuthProvider` (`src/lib/auth.tsx`) usa `supabase.auth.getSession()` y `supabase.auth.onAuthStateChange()` para mantener `session` y `user`; tras autenticar llama `supabase.rpc('get_my_role')` para resolver `role`. El contexto exporta `user, session, role, isAdvocate, isClient, loading, signOut`.
+ **Onboarding de invitados:** `src/lib/invite-routing.ts` detecta callbacks de invitación (`type=invite` más tokens en search/hash). `ProtectedRoute` considera `isInviteFlow` para relajar ciertos checks durante el flujo de invitación.
+ **Guard (ProtectedRoute) — reglas y orden de validación:**
++ 1) Si `profiles.must_change_password` es true → forzar `/change-password` (se evalúa antes que el resto).
++ 2) Si no hay `role` asignado → forzar `/account-pending`.
++ 3) Si `requireRole` difiere de `role` → redirigir al home del rol (`/client/dashboard` o `/advocate/dashboard`).
++ 4) Para `client`: si `onboarding_completed_at` falta (y no es invite flow) → `/client/onboarding`.
++ 5) Si onboarding está completado, calcular el primer paso pendiente entre: `payment_completed_at` → `/client/payment`, `agreements_completed_at` → `/client/agreements`, `intake_completed_at` → `/client/intake-form`. Ese primer objetivo es el `gateTarget` que bloquea acceso a rutas no exentas.

Orden canónico del Journey del cliente (aplicado por `ProtectedRoute` + `protected-route-logic.ts`):
+ Account Pending → Change Password → Onboarding → Payment → Agreements → Intake Form → Dashboard

Rutas exentas (permitidas aun con gating): subpaths de onboarding, agreements, settings, support, payment, intake-form, check-in y `/change-password`.

### 4. Patrones Estrictos y Antipatrones a Evitar

+ Directiva 1 — `useEffect` y dependencias: cuando un `useEffect` haga peticiones a la BD o desencadene redirecciones, extraer `user?.id` como valor primitivo (p. ej. `const userId = user?.id`) y usar `userId` en el array de dependencias. No usar objetos `user`/`session` completos ni rutas reactivas (`location`) como dependencias, para evitar bucles de renderizado infinito.
+ Directiva 2 — navegación condicional segura: antes de ejecutar `<Navigate to=... />` comprobar que la ruta destino no es la misma que la actual (ej. `if (location.pathname !== destino) return <Navigate to={destino} replace />;`). Esto evita redirecciones repetitivas y estados intermedios inconsistentes.
+ Directiva 3 — confianza en la BD para invariantes de seguridad: la identidad del remitente y su rol en mensajes debe siempre ser impuesta por la BD (trigger `set_message_sender_role()`); el frontend no debe asumir que `sender_id`/`sender_role` son fiables para validación de permisos.
+ Antipatrón a evitar: añadir lógica de gate o actualización de flags del perfil únicamente en el frontend; la fuente de la verdad y validaciones deben residir en SQL/RLS/RPC cuando afecten permisos o integridad (por ejemplo, creación/atribución de threads y stamping de sender).

---
Fuentes concretas en el repo (referencia rápida):
+ Supabase client: src/integrations/supabase/client.ts
+ Auth context: src/lib/auth.tsx
+ Protected route: src/components/ProtectedRoute.tsx
+ Route logic: src/components/protected-route-logic.ts
+ Messaging schema & triggers: supabase/migrations_legacy/* and supabase/migrations/20260626140000_baseline_remote_schema.sql
