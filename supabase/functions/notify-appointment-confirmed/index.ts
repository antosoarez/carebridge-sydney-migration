// AVAIL-F: send immediate confirmation notifications when an appointment
// is confirmed. Reuses the existing send-transactional-email queue (email)
// and the existing web-push helper (push). Idempotent via the
// appointment_notification_log table — duplicate calls are safe.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { sendWebPush, isExpiredPushError } from '../_shared/web-push.ts'
import { insertInAppNotification } from '../_shared/inapp-notify.ts'

const APP_URL = 'https://www.client.carebridgeperth.com'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function whenLabel(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-AU', {
      weekday: 'long', day: 'numeric', month: 'short',
      hour: 'numeric', minute: '2-digit', hour12: true,
    })
  } catch { return iso }
}

function firstName(full?: string | null): string | null {
  if (!full) return null
  const t = full.trim().split(/\s+/)[0]
  return t || null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // --- AuthN: require a valid JWT ---
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  const token = authHeader.replace('Bearer ', '')
  const authClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
  )
  const { data: claimsData, error: claimsErr } = await authClient.auth.getClaims(token)
  if (claimsErr || !claimsData?.claims?.sub) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  const callerId = claimsData.claims.sub as string

  let body: { appointment_id?: string }
  try { body = await req.json() } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  const appointmentId = body.appointment_id
  if (!appointmentId || typeof appointmentId !== 'string') {
    return new Response(JSON.stringify({ error: 'appointment_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: appt, error: aErr } = await supabase
    .from('appointments')
    .select('id, client_id, created_by, title, starts_at, ends_at, location, provider_name, practitioner_name, client_visible_notes, advocate_private_notes, preparation_instructions, what_to_bring, outcome, availability_request_id')
    .eq('id', appointmentId)
    .maybeSingle()
  if (aErr || !appt) {
    return new Response(JSON.stringify({ error: 'Appointment not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  if (appt.outcome === 'cancelled_missed' || appt.outcome === 'cancelled') {
    return new Response(JSON.stringify({ skipped: 'cancelled' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // --- AuthZ: caller must be the appointment's client, its creator, or an advocate ---
  let isAdvocate = false
  if (callerId !== appt.client_id && callerId !== appt.created_by) {
    const { data: roleRow } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', callerId)
      .eq('role', 'advocate')
      .maybeSingle()
    isAdvocate = !!roleRow
    if (!isAdvocate) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
  }

  let clinicName: string | null = null
  if (appt.availability_request_id) {
    const { data: ar } = await supabase
      .from('availability_requests')
      .select('clinic_name')
      .eq('id', appt.availability_request_id)
      .maybeSingle()
    clinicName = (ar?.clinic_name as string | null) ?? null
  }

  const [{ data: clientProf }, { data: advocateProf }] = await Promise.all([
    supabase.from('profiles').select('id, email, full_name').eq('id', appt.client_id).maybeSingle(),
    supabase.from('profiles').select('id, email, full_name').eq('id', appt.created_by).maybeSingle(),
  ])

  const when = whenLabel(appt.starts_at as string)

  async function alreadySent(kind: string, channel: string, role: 'client' | 'advocate'): Promise<boolean> {
    const { data } = await supabase
      .from('appointment_notification_log')
      .select('appointment_id')
      .eq('appointment_id', appointmentId)
      .eq('kind', kind)
      .eq('channel', channel)
      .eq('recipient_role', role)
      .maybeSingle()
    return !!data
  }

  async function logSent(kind: string, channel: string, role: 'client' | 'advocate', recipientId: string): Promise<void> {
    await supabase.from('appointment_notification_log').insert({
      appointment_id: appointmentId, kind, channel,
      recipient_role: role, recipient_id: recipientId,
    })
  }

  async function pushTo(userId: string, payload: { title: string; body: string; url?: string; tag?: string }, kind: string, role: 'client' | 'advocate'): Promise<void> {
    if (await alreadySent(kind, 'push', role)) return
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, keys')
      .eq('user_id', userId)
      .eq('is_active', true)
    if (!subs || subs.length === 0) return
    let anySent = false
    for (const s of subs) {
      try {
        await sendWebPush({ endpoint: s.endpoint as string, keys: s.keys as any }, payload)
        anySent = true
      } catch (err) {
        if (isExpiredPushError(err)) {
          await supabase.from('push_subscriptions').delete().eq('id', s.id)
        } else {
          console.error('push failed', err)
        }
      }
    }
    if (anySent) await logSent(kind, 'push', role, userId)
  }

  // --- Client email ---
  if (clientProf?.email && !(await alreadySent('confirmed', 'email', 'client'))) {
    const { error: invErr } = await supabase.functions.invoke('send-transactional-email', {
      body: {
        templateName: 'appointment-confirmed',
        recipientEmail: clientProf.email,
        idempotencyKey: `appt-confirmed-${appointmentId}`,
        templateData: {
          clientName: firstName(clientProf.full_name),
          whenLabel: when,
          clinicName,
          providerName: appt.provider_name,
          practitionerName: appt.practitioner_name,
          location: appt.location,
          mode: null,
          preparationInstructions: appt.preparation_instructions,
          whatToBring: appt.what_to_bring,
          clientVisibleNotes: appt.client_visible_notes,
        },
      },
    })
    if (!invErr) await logSent('confirmed', 'email', 'client', appt.client_id)
    else console.error('client email failed', invErr)
  }

  // --- Advocate email ---
  if (advocateProf?.email && !(await alreadySent('confirmed', 'email', 'advocate'))) {
    const { error: invErr } = await supabase.functions.invoke('send-transactional-email', {
      body: {
        templateName: 'appointment-confirmed-advocate',
        recipientEmail: advocateProf.email,
        idempotencyKey: `appt-confirmed-advocate-${appointmentId}`,
        templateData: {
          clientName: clientProf?.full_name || null,
          whenLabel: when,
          clinicName,
          providerName: appt.provider_name,
          practitionerName: appt.practitioner_name,
          location: appt.location,
          advocatePrivateNotes: appt.advocate_private_notes,
          reviewUrl: appt.availability_request_id
            ? `${APP_URL}/advocate/availability/${appt.availability_request_id}/review`
            : `${APP_URL}/advocate/calendar`,
        },
      },
    })
    if (!invErr) await logSent('confirmed', 'email', 'advocate', appt.created_by)
    else console.error('advocate email failed', invErr)
  }

  // --- Push (client) ---
  await pushTo(appt.client_id as string, {
    title: 'Appointment confirmed',
    body: 'Your appointment has been confirmed. You can view the details in your calendar.',
    url: `${APP_URL}/calendar`,
    tag: `appt-confirmed-${appointmentId}`,
  }, 'confirmed', 'client')

  // --- Push (advocate) ---
  await pushTo(appt.created_by as string, {
    title: 'Appointment confirmed',
    body: 'The confirmed appointment has been added to the client and advocate calendars.',
    url: appt.availability_request_id
      ? `${APP_URL}/advocate/availability/${appt.availability_request_id}/review`
      : `${APP_URL}/advocate/calendar`,
    tag: `appt-confirmed-adv-${appointmentId}`,
  }, 'confirmed', 'advocate')

  // --- In-app (client) ---
  if (!(await alreadySent('confirmed', 'inapp', 'client'))) {
    const res = await insertInAppNotification(supabase, {
      user_id: appt.client_id as string,
      user_role: 'client',
      kind: 'appointment_confirmed',
      title: 'Appointment confirmed',
      body: `${when}${clinicName ? ` · ${clinicName}` : ''}`,
      link: '/client/calendar',
      metadata: { appointment_id: appointmentId },
    })
    if (res.ok) await logSent('confirmed', 'inapp', 'client', appt.client_id as string)
  }

  // --- In-app (advocate) ---
  if (!(await alreadySent('confirmed', 'inapp', 'advocate'))) {
    const res = await insertInAppNotification(supabase, {
      user_id: appt.created_by as string,
      user_role: 'advocate',
      kind: 'appointment_confirmed',
      title: 'Appointment confirmed',
      body: `${clientProf?.full_name ? clientProf.full_name + ' · ' : ''}${when}`,
      link: appt.availability_request_id
        ? `/advocate/availability/${appt.availability_request_id}/review`
        : '/advocate/calendar',
      metadata: { appointment_id: appointmentId, availability_request_id: appt.availability_request_id },
    })
    if (res.ok) await logSent('confirmed', 'inapp', 'advocate', appt.created_by as string)
  }

  return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
