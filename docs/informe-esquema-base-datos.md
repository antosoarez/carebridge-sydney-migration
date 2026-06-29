# Informe del esquema — CareBridge Perth (Supabase/PostgreSQL)

Fuente: migraciones activas en `supabase/migrations/` (baseline + fases 0–5). Proyecto canónico `dkfjmtysfuqtdpaqpxsd`.

---

## 1. Tablas

- **agreement_documents** — Catálogo versionado de documentos legales/contratos (markdown) que el cliente debe aceptar.
- **appointment_notification_log** — Registro idempotente de notificaciones enviadas por cita (tipo, canal, destinatario).
- **appointments** — Citas médicas del cliente (fecha, ubicación, outcome, enlace a solicitud de disponibilidad, notas).
- **attention_signals** — Señales de atención prioritaria del advocate sobre un cliente (mensajes sin leer, etc.).
- **availability_options** — Franjas/opciones de fecha-hora propuestas dentro de una solicitud de disponibilidad.
- **availability_requests** — Flujo de coordinación advocate↔cliente↔clínica para reservar una cita externa.
- **client_agreement_acceptances** — Aceptaciones firmadas por cliente de cada `agreement_documents` (versión, IP, método).
- **client_availability_preferences** — Preferencias del cliente (mañana/tarde, telehealth, transporte) por solicitud.
- **client_cases** — Casos de advocacy CRM (estado, objetivo, próxima acción, tier, pago).
- **client_consents** — Consentimientos legales del cliente (alcance, privacidad) con texto y timestamp.
- **client_fee_arrangements** — Acuerdo de honorarios por cliente (importe total, modelo de pago, enlace externo).
- **client_internal_notes** — Notas internas del advocate sobre un cliente (no visibles al cliente).
- **client_intake** — Formulario de intake clínico/administrativo del cliente (borrador + `submitted_at`).
- **client_lifecycle_events** — Auditoría de cambios de `lifecycle_status` en perfiles.
- **client_navigation_intake** — Intake simplificado de navegación/onboarding (pasos GP, referral, etc.).
- **client_payments** — Líneas de pago/factura por cliente (importe, pagado, Stripe, recordatorios).
- **client_report_meta** — Progreso del informe médico del cliente (0–100, ventana solicitada).
- **clinic_contact_logs** — Bitácora de llamadas del advocate a clínicas durante coordinación de citas.
- **document_templates** — Plantillas de documentos reutilizables subidas por el advocate.
- **documents** — Archivos subidos (storage path, estado de revisión, visibilidad, categoría).
- **email_change_requests** — Solicitudes de cambio de email con token y estado de verificación.
- **email_send_log** — Log de envíos de email transaccional (plantilla, estado, errores).
- **email_send_state** — Configuración global del despachador de email (tamaño de lote, TTL, retry).
- **email_unsubscribe_tokens** — Tokens de baja de comunicaciones por email.
- **emotion_logs** — Registro diario de estado emocional del cliente (check-in de bienestar).
- **inbound_messages** — Consultas públicas del formulario de contacto / leads no convertidos.
- **message_attachments** — Adjuntos en hilos de mensajería (storage, metadatos).
- **message_notification_log** — Control de emails de notificación de mensajes no leídos (1º/2º aviso).
- **message_threads** — Hilo 1:1 cliente↔advocate con timestamp del último mensaje.
- **messages** — Mensajes del hilo (cuerpo, rol del emisor, lectura).
- **message_templates** — Biblioteca editable de copy para notificaciones/automatizaciones.
- **mfa_recovery_codes** — Códigos de recuperación MFA hasheados por usuario.
- **notification_settings** — Preferencias de notificación por usuario (email, push, quiet hours).
- **notifications** — Notificaciones in-app por usuario (título, enlace, metadata).
- **payment_note_dismissals** — Descartes de avisos de pago por cliente/pago.
- **payment_reminders_log** — Historial de recordatorios de pago enviados.
- **payment_settings** — Configuración global de pagos (datos bancarios, moneda).
- **profiles** — Perfil extendido del usuario (lifecycle, urgencia, progreso, tier, flags de gating).
- **push_subscriptions** — Suscripciones Web Push por usuario/dispositivo.
- **report_comments** — Comentarios cliente/advocate sobre un informe en revisión.
- **reports** — Informes médicos del cliente (archivo, etapa, visibilidad, acuerdo del cliente).
- **service_tiers** — Catálogo de tiers de servicio con precio AUD y enlace Stripe.
- **suppressed_emails** — Lista de emails bloqueados (bounce, complaint, unsubscribe).
- **task_status_events** — Historial de transiciones de estado de tareas.
- **task_subtasks** — Subtareas de una tarea principal.
- **tasks** — Tareas del advocate/cliente (due date, prioridad, deduplicación automática).
- **trusted_devices** — Dispositivos de confianza para recordar MFA.
- **user_roles** — Rol único por usuario (`advocate` | `client`).
- **advocate_availability** — Franjas semanales recurrentes de disponibilidad del advocate para booking.
- **automation_outbox** — Cola de notificaciones client-safe para despacho asíncrono (email + in-app).
- **automation_rules** — Reglas del motor de automatización (trigger_kind, config, prioridad).
- **automation_rule_actions** — Acciones encadenadas por regla (`set_stage`, `create_task`, `notify`, etc.).
- **automation_runs** — Log idempotente de ejecuciones de reglas (dedup por slug+cliente+event_key).

---

## 2. Procedimientos / Funciones (stored procedures)

### Identidad, roles y onboarding

- **_primary_advocate_id()** — Devuelve el UUID del primer advocate registrado; patrón de práctica única.
- **has_role(uuid, app_role)** — Comprueba si un usuario tiene un rol; base de RLS y guards.
- **get_my_role()** — Devuelve el rol del usuario autenticado sin exponer IDs arbitrarios.
- **is_advocate()** — Atajo booleano para comprobar rol advocate en la sesión actual.
- **handle_new_user()** — Trigger function en signup: crea `profiles`, asigna rol `client`, inicializa `notification_settings`.
- **invalidate_user_auth_tokens(uuid)** — Invalida tokens de auth de un usuario (cambio de email, seguridad).
- **mark_client_invited(uuid)** — Marca cliente recién creado como `Invited` evitando el guard de campos advocate.
- **admin_delete_client(uuid)** — Borrado en cascada de datos de un cliente (solo advocate).

### Perfil, progreso y urgencia

- **guard_profile_advocate_fields()** — Trigger: impide que clientes modifiquen tier, lifecycle, progreso, etc.
- **bump_client_progress(uuid, int, int)** — Incrementa `client_progress` con tope para acciones del cliente.
- **recompute_client_progress(uuid)** — Recalcula progreso desde citas, documentos y tareas completadas.
- **calculate_client_urgency(uuid)** — Calcula score/nivel de urgencia y actualiza `profiles`; alimenta dashboard advocate.
- **recalculate_all_active_client_urgency()** — Recalcula urgencia de todos los clientes activos (batch/cron).

### Motor de automatización del lifecycle

- **touch_lifecycle_changed_at()** — Trigger: actualiza `lifecycle_status_changed_at` al cambiar etapa.
- **log_lifecycle_change()** — Trigger: inserta fila en `client_lifecycle_events` al cambiar lifecycle.
- **client_has_all_required_agreements(uuid)** — Comprueba si el cliente aceptó todos los acuerdos obligatorios.
- **run_automations(text, uuid, text, jsonb)** — Dispatcher central: evalúa reglas, ejecuta acciones, registra en `automation_runs`, encola `notify` en outbox.
- **scan_stage_timeouts()** — Cron: detecta clientes estancados 3+ días en acuerdos/pago y dispara reglas.
- **trg_enquiry_created()** — Trigger: dispara automatización al entrar en `New enquiry`.
- **trg_appointment_event()** — Trigger: dispara `appointment_booked` / `appointment_completed` (outcome `attended`).
- **trg_agreement_accepted()** — Trigger: dispara `agreements_completed` cuando todos los acuerdos están firmados.
- **trg_payment_received()** — Trigger: dispara `payment_received` al marcar pago como pagado.
- **trg_document_uploaded()** — Trigger: dispara `document_uploaded` al subir documento.
- **trg_stage_changed()** — Trigger: dispara `stage_changed` en cada transición de lifecycle.

### Gating del journey (flags en profiles)

- **trg_flag_agreements_done()** — Trigger: marca `agreements_completed_at` cuando acuerdos completos.
- **trg_flag_payment_done()** — Trigger: marca `payment_completed_at` al pagar.
- **trg_flag_consultation_booked()** — Trigger: marca `consultation_booked_at` al crear cita `consultation`.
- **trg_flag_intake_done()** — Trigger: marca `intake_completed_at` al enviar intake.
- **mark_paid_manually(uuid, text, text, numeric)** — RPC advocate: registra pago manual y dispara triggers de pago.

### Notificaciones y outbox

- **client_uploads_done()** — RPC cliente: notifica al advocate que terminó de subir documentos (dedup diario).
- **trg_appointment_booked_notify()** — Trigger: confirma cita consultation/followup vía outbox + tarea de preparación.
- **trg_task_report_done()** — Trigger: al completar tarea de entrega de informe, notifica cliente y avanza lifecycle.
- **auto_complete_appointments()** — Cron: marca citas pasadas como `attended` y encola post-consultation.
- **enqueue_appointment_reminders()** — Cron: encola recordatorios 24h y 1h antes de la cita.
- **member_engagement_check()** — Cron: check-in por bajo ánimo y escalado de tareas vencidas vía outbox.

### Mensajería

- **ensure_message_thread_for_client(uuid)** — Crea hilo advocate↔cliente y caso inicial si no existen.
- **trg_profile_activation_thread()** — Trigger: provisiona hilo al activar/onboarding completo del cliente.
- **bump_thread_last_message_at()** — Trigger: actualiza `last_message_at` del hilo al insertar mensaje.
- **set_message_sender_role()** — Trigger: fija `sender_id` y `sender_role` desde la sesión autenticada.
- **mark_thread_read(uuid)** — Marca mensajes del hilo como leídos y resuelve señales de atención.
- **get_my_advocate()** — Devuelve datos del advocate asignado al cliente autenticado.

### Citas y disponibilidad

- **availability_requests_status_guard()** — Trigger: valida transiciones de estado del flujo de disponibilidad por rol.
- **availability_requests_touch()** — Trigger: timestamps y `advocate_id` en solicitudes de disponibilidad.
- **client_availability_preferences_touch()** — Trigger: actualiza `updated_at` de preferencias.
- **clinic_contact_logs_stamp()** — Trigger: asigna `advocate_id` al registrar contacto con clínica.
- **get_appointment_private_notes_map()** — Mapa de notas privadas del advocate por cita (solo advocate).
- **get_advocate_notes(uuid)** — Lee notas internas del advocate en una solicitud de disponibilidad.

### Tareas automáticas del advocate

- **create_task_on_new_enquiry()** — Trigger: crea tarea de respuesta al recibir consulta nueva en `inbound_messages`.
- **trg_auto_task_appt_created()** — Trigger: tarea de preparación 24h antes de cita nueva.
- **trg_auto_task_appt_attended()** — Trigger: tarea de seguimiento post-cita al marcar `attended`.
- **trg_auto_task_client_activated()** — Trigger: tarea de revisión al activar portal del cliente.
- **trg_auto_task_doc_uploaded()** — Función de tarea por documento (trigger `trg_auto_task_doc_uploaded` eliminado; lo cubre `trg_document_uploaded` + regla `on_doc_uploaded`).
- **trg_auto_task_report_feedback()** — Trigger: tarea al recibir feedback del cliente en informe.
- **log_task_status_event()** — Trigger: audita cambios de estado en `task_status_events`.
- **create_overdue_task_reminders()** — Cron legacy: crea tareas de recordatorio por tareas vencidas (3/7/14 días).
- **process_auto_advocate_tasks()** — Cron: crea tareas por mensajes sin leer, bajo ánimo y pagos vencidos.

### Casos CRM

- **client_cases_auto_close()** — Trigger: fija `closed_at` al cerrar/completar caso.
- **client_cases_sync_next_action_task()** — Trigger: sincroniza `next_action` del caso con una tarea deduplicada.
- **touch_client_cases_updated_at()** — Trigger: actualiza `updated_at` de casos.

### Informes

- **share_report_for_review(uuid)** — Advocate comparte informe para revisión del cliente.
- **agree_report(uuid)** — Cliente confirma acuerdo con el informe compartido.
- **send_back_report(uuid, text)** — Cliente devuelve informe con feedback.
- **revert_report_to_draft(uuid)** — Advocate revierte informe a borrador.
- **set_report_stage_visibility(uuid, report_stage, report_visibility)** — Cambia etapa/visibilidad del informe.
- **reset_report_progress(uuid)** — Reinicia progreso del informe del cliente.
- **set_report_comment_author_role()** — Trigger: fija autor y rol en comentarios de informe.

### Pagos

- **touch_payment_row()** — Trigger: timestamps, `updated_by`, y fechas auto de factura/pago.

### Dashboard y CRM (consultas agregadas)

- **get_advocate_dashboard_counts()** — Contadores del dashboard advocate (enquiries, tareas, mensajes, etc.).
- **get_client_crm_summary(uuid)** — Resumen CRM de un cliente (caso activo, pagos, citas, moods, señales).
- **get_client_emotion_summary(uuid, int)** — Agregación diaria de emociones por cliente.
- **get_recent_low_mood_rows(int)** — Filas de bajo ánimo recientes para el advocate.

### Recompute de progreso (triggers)

- **trg_recompute_appointments()** — Trigger: recalcula progreso al cambiar citas.
- **trg_recompute_documents()** — Trigger: recalcula progreso al cambiar documentos.
- **trg_recompute_tasks()** — Trigger: recalcula progreso al cambiar tareas.

### Urgencia (triggers delegados)

- **trg_urgency_appointments()** — Recalcula urgencia al cambiar citas.
- **trg_urgency_client_cases()** — Recalcula urgencia al cambiar casos.
- **trg_urgency_client_payments()** — Recalcula urgencia al cambiar pagos.
- **trg_urgency_client_report_meta()** — Recalcula urgencia al cambiar meta de informe.
- **trg_urgency_documents()** — Recalcula urgencia al cambiar documentos.
- **trg_urgency_emotion_logs()** — Recalcula urgencia al registrar emoción.
- **trg_urgency_messages()** — Recalcula urgencia al enviar/leer mensajes.
- **trg_urgency_reports()** — Recalcula urgencia al cambiar informes.

### Notificaciones in-app

- **mark_notification_read(uuid)** — Marca una notificación como leída.
- **mark_all_notifications_read()** — Marca todas las notificaciones del usuario como leídas.

### Email queue (pgmq)

- **enqueue_email(text, jsonb)** — Encola mensaje en cola PGMQ.
- **read_email_batch(text, int, int)** — Lee lote de la cola con visibility timeout.
- **delete_email(text, bigint)** — Elimina mensaje procesado de la cola.
- **move_to_dlq(text, text, bigint, jsonb)** — Mueve mensaje fallido a dead-letter queue.

### MFA y dispositivos

- **count_my_active_recovery_codes()** — Cuenta códigos MFA no usados del usuario actual.
- **find_my_trusted_device(text)** — Busca dispositivo de confianza por hash de token.
- **list_my_trusted_devices()** — Lista dispositivos de confianza del usuario.
- **upsert_my_push_subscription(text, jsonb, text)** — Registra/actualiza suscripción Web Push.

### Touch helpers (timestamps)

- **touch_client_internal_notes()** — Actualiza `updated_at`/`updated_by` de notas internas.
- **touch_client_navigation_intake()** — Actualiza `updated_at` del intake de navegación.
- **touch_client_report_meta()** — Actualiza `updated_at` de meta de informe.
- **touch_inbound_messages_updated_at()** — Actualiza `updated_at` de consultas entrantes.
- **touch_reports_updated_at()** — Actualiza `updated_at` de informes.
- **touch_task_subtasks_updated_at()** — Actualiza `updated_at` de subtareas.

---

## 3. Triggers

| Trigger | Tabla | Momento | Función | Propósito |
|---------|-------|---------|---------|-----------|
| **appointments_recompute_progress** | appointments | AFTER INSERT/UPDATE/DELETE | trg_recompute_appointments | Recalcula `client_progress` del cliente afectado. |
| **trg_appts_event** | appointments | AFTER INSERT/UPDATE | trg_appointment_event | Dispara motor de automatización en reserva/completado de cita. |
| **trg_auto_task_appt_created** | appointments | AFTER INSERT | trg_auto_task_appt_created | Crea tarea de preparación antes de la cita. |
| **trg_auto_task_appt_attended** | appointments | AFTER UPDATE OF outcome | trg_auto_task_appt_attended | Crea tarea de seguimiento post-asistencia. |
| **trg_appointment_booked_notify** | appointments | AFTER INSERT | trg_appointment_booked_notify | Confirma consultation/followup vía outbox y tarea prep. |
| **trg_flag_consultation_booked** | appointments | AFTER INSERT | trg_flag_consultation_booked | Marca flag `consultation_booked_at` en profile. |
| **urgency_appointments_trg** | appointments | AFTER INSERT/UPDATE/DELETE | trg_urgency_appointments | Recalcula score de urgencia del cliente. |
| **documents_recompute_progress** | documents | AFTER INSERT/UPDATE/DELETE | trg_recompute_documents | Recalcula progreso por documentos subidos. |
| **trg_document_uploaded** | documents | AFTER INSERT | trg_document_uploaded | Dispara automatización `document_uploaded`. |
| **urgency_documents_trg** | documents | AFTER INSERT/UPDATE/DELETE | trg_urgency_documents | Recalcula urgencia. |
| **guard_profile_advocate_fields_trg** | profiles | BEFORE UPDATE | guard_profile_advocate_fields | Protege campos solo-advocate en profiles. |
| **profiles_guard_advocate_fields** | profiles | BEFORE UPDATE | guard_profile_advocate_fields | Duplicado del guard anterior (misma lógica). |
| **trg_profiles_lifecycle_changed** | profiles | BEFORE UPDATE | touch_lifecycle_changed_at | Timestamp del último cambio de lifecycle. |
| **trg_profiles_lifecycle_log** | profiles | AFTER UPDATE | log_lifecycle_change | Auditoría en `client_lifecycle_events`. |
| **trg_profiles_enquiry_created** | profiles | AFTER INSERT/UPDATE OF lifecycle_status | trg_enquiry_created | Automatización al entrar en `New enquiry`. |
| **trg_profiles_stage_changed** | profiles | AFTER UPDATE OF lifecycle_status | trg_stage_changed | Automatización en cada transición de etapa. |
| **trg_auto_task_client_activated** | profiles | AFTER INSERT/UPDATE OF activated_at | trg_auto_task_client_activated | Tarea de revisión al activar cliente. |
| **trg_profile_activated_create_thread** | profiles | AFTER INSERT/UPDATE OF activated_at | trg_profile_activation_thread | Crea hilo de mensajería y caso inicial. |
| **trg_agreement_accepted** | client_agreement_acceptances | AFTER INSERT | trg_agreement_accepted | Automatización cuando acuerdos completos. |
| **trg_flag_agreements_done** | client_agreement_acceptances | AFTER INSERT | trg_flag_agreements_done | Marca `agreements_completed_at`. |
| **trg_payment_received** | client_payments | AFTER UPDATE | trg_payment_received | Automatización al confirmar pago. |
| **trg_flag_payment_done** | client_payments | AFTER UPDATE | trg_flag_payment_done | Marca `payment_completed_at`. |
| **touch_client_payments** | client_payments | BEFORE INSERT/UPDATE | touch_payment_row | Timestamps y fechas de factura/pago. |
| **urgency_client_payments_trg** | client_payments | AFTER INSERT/UPDATE OF paid, invoice_given | trg_urgency_client_payments | Recalcula urgencia. |
| **trg_flag_intake_done** | client_intake | AFTER INSERT/UPDATE | trg_flag_intake_done | Marca `intake_completed_at` al enviar intake. |
| **tasks_recompute_progress** | tasks | AFTER INSERT/UPDATE/DELETE | trg_recompute_tasks | Recalcula progreso por tareas. |
| **trg_log_task_status_event** | tasks | AFTER INSERT/UPDATE OF status | log_task_status_event | Historial de estados de tarea. |
| **trg_task_report_done** | tasks | AFTER UPDATE | trg_task_report_done | Notifica informe listo y avanza lifecycle. |
| **report_comments_set_author** | report_comments | BEFORE INSERT | set_report_comment_author_role | Fija autor/rol del comentario. |
| **trg_auto_task_report_feedback** | report_comments | AFTER INSERT | trg_auto_task_report_feedback | Tarea al recibir feedback de informe. |
| **trg_reports_updated_at** | reports | BEFORE UPDATE | touch_reports_updated_at | Actualiza `updated_at`. |
| **urgency_reports_trg** | reports | AFTER INSERT/UPDATE/DELETE | trg_urgency_reports | Recalcula urgencia. |
| **trg_bump_thread_last_message_at** | messages | AFTER INSERT | bump_thread_last_message_at | Actualiza último mensaje del hilo. |
| **trg_set_message_sender_role** | messages | BEFORE INSERT | set_message_sender_role | Fija emisor y rol del mensaje. |
| **urgency_messages_trg** | messages | AFTER INSERT/UPDATE OF read_at | trg_urgency_messages | Recalcula urgencia al mensajear/leer. |
| **trg_inbound_messages_create_task** | inbound_messages | AFTER INSERT | create_task_on_new_enquiry | Tarea de respuesta a nueva consulta. |
| **trg_touch_inbound_messages_updated_at** | inbound_messages | BEFORE UPDATE | touch_inbound_messages_updated_at | Actualiza `updated_at`. |
| **trg_availability_requests_status_guard** | availability_requests | BEFORE UPDATE OF status | availability_requests_status_guard | Máquina de estados del flujo de booking. |
| **trg_availability_requests_touch** | availability_requests | BEFORE INSERT/UPDATE | availability_requests_touch | Timestamps y advocate_id. |
| **trg_client_availability_preferences_touch** | client_availability_preferences | BEFORE UPDATE | client_availability_preferences_touch | Actualiza `updated_at`. |
| **trg_clinic_contact_logs_stamp** | clinic_contact_logs | BEFORE INSERT | clinic_contact_logs_stamp | Asigna advocate al log. |
| **trg_client_cases_auto_close** | client_cases | BEFORE INSERT/UPDATE OF case_status | client_cases_auto_close | Fija `closed_at` al cerrar caso. |
| **trg_client_cases_sync_task** | client_cases | AFTER INSERT/UPDATE | client_cases_sync_next_action_task | Sincroniza próxima acción con tarea. |
| **trg_client_cases_touch** | client_cases | BEFORE UPDATE | touch_client_cases_updated_at | Actualiza `updated_at`. |
| **urgency_client_cases_trg** | client_cases | AFTER INSERT/UPDATE/DELETE | trg_urgency_client_cases | Recalcula urgencia. |
| **touch_client_internal_notes_t** | client_internal_notes | BEFORE INSERT/UPDATE | touch_client_internal_notes | Timestamps y autor de nota. |
| **touch_client_report_meta_t** | client_report_meta | BEFORE UPDATE | touch_client_report_meta | Actualiza `updated_at`. |
| **urgency_client_report_meta_trg** | client_report_meta | AFTER INSERT/UPDATE | trg_urgency_client_report_meta | Recalcula urgencia. |
| **touch_fee_arrangements** | client_fee_arrangements | BEFORE INSERT/UPDATE | touch_payment_row | Timestamps de arreglo de honorarios. |
| **touch_payment_settings** | payment_settings | BEFORE UPDATE | touch_payment_row | Timestamp de configuración global. |
| **trg_touch_client_navigation_intake** | client_navigation_intake | BEFORE UPDATE | touch_client_navigation_intake | Actualiza `updated_at`. |
| **trg_touch_task_subtasks_updated_at** | task_subtasks | BEFORE UPDATE | touch_task_subtasks_updated_at | Actualiza `updated_at`. |
| **urgency_emotion_logs_trg** | emotion_logs | AFTER INSERT | trg_urgency_emotion_logs | Recalcula urgencia tras check-in emocional. |

**Nota:** El trigger `trg_auto_task_doc_uploaded` en `documents` fue eliminado (migración phase0); la revisión de documentos la cubre la regla `on_doc_uploaded` vía `trg_document_uploaded`.

**Trigger en auth (fuera del dump baseline, presente en legacy):** `on_auth_user_created` → AFTER INSERT ON `auth.users` → `handle_new_user()` — bootstrap de perfil y rol al registrarse.

---

## 4. Resumen

| Objeto | Total |
|--------|------:|
| Tablas (`public`) | **53** |
| Funciones (`public`) | **~96** |
| Triggers (`public`) | **55** (+1 en `auth.users` si aplicado en producción) |

### Relaciones y automatización

**Núcleo de identidad:** `auth.users` → `profiles` (1:1) → `user_roles` (1 rol). Todo el dominio cliente cuelga de `profiles.id` como `client_id`.

**Journey del cliente (lifecycle):** `profiles.lifecycle_status` es el eje. Los triggers en `profiles`, `appointments`, `client_agreement_acceptances`, `client_payments` y `documents` emiten eventos a `run_automations()`, que lee `automation_rules` + `automation_rule_actions` y puede: cambiar etapa, crear `tasks`, desbloquear pago (`payment_gate_unlocked_at`), activar portal (`activated_at`) y encolar `automation_outbox`. `automation_runs` garantiza idempotencia. `scan_stage_timeouts()` (cron horario) cubre timeouts de acuerdos/pago.

**Gating frontend:** Triggers dedicados en acuerdos, pagos, citas e intake mantienen flags (`agreements_completed_at`, `payment_completed_at`, `consultation_booked_at`, `intake_completed_at`) en `profiles` para rutas protegidas sin joins costosos.

**Coordinación clínica:** `availability_requests` → `availability_options` + `client_availability_preferences` → `clinic_contact_logs` → `appointments` (vía `availability_request_id`).

**Mensajería:** `message_threads` (cliente+advocate) → `messages` + `message_attachments`. Activación del hilo vía `trg_profile_activation_thread`. Lectura vía `mark_thread_read`.

**Tareas y CRM:** `tasks` se crean manualmente, por enquiries (`inbound_messages`), por casos (`client_cases.next_action`), por crons (`process_auto_advocate_tasks`, `create_overdue_task_reminders`) y por el motor de automatización. `task_status_events` audita cambios.

**Informes:** `reports` + `report_comments` + `client_report_meta`. Entrega automatizada vía `trg_task_report_done` → outbox + lifecycle `Report delivered`.

**Pagos:** `service_tiers` (catálogo) → `client_payments` (Stripe webhook escribe `stripe_session_id`, flip `paid`) → triggers `trg_payment_received` + `trg_flag_payment_done`.

**Urgencia y progreso:** Triggers en citas/documentos/tareas recalculan `client_progress`; triggers de urgencia en 8 tablas llaman `calculate_client_urgency()` que escribe `urgency_score`/`urgency_level` en `profiles`.

**Notificaciones:** `automation_outbox` (pending) → edge function `dispatch-automation-outbox` (cron cada minuto vía pg_net) → email (Resend) + `notifications` in-app. Plantillas editables en `message_templates`.

**Crons pg_cron relevantes:** `scan-stage-timeouts-hourly`, `dispatch-automation-outbox`, `auto-complete-appointments`, `appointment-reminders`, `member-engagement-check`.
