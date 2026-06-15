// AVAIL-F: appointment reminders cron. Runs every 15 minutes.
// Two windows:
//   - 24h before  (23-25h ahead) — templates appointment-reminder / appointment-reminder-advocate
//   - 4h  before  (3-5h ahead)   — templates appointment-4h-reminder / appointment-4h-reminder-advocate
// For each appointment + recipient (client + advocate) + channel (email + push):
//   - skip if appointment_notification_log already has that row (dedupe)
//   - send via existing send-transactional-email (email) or web-push helper (push)
//   - record success in appointment_notification_log
// Cancelled / attended / missed / rescheduled / follow_up_needed appointments are
// excluded by the `outcome = 'scheduled'` filter.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { sendWebPush, isExpiredPushError } from '../_shared/web-push.ts'
import { insertInAppNotification } from '../_shared/inapp-notify.ts'

const APP_URL = 'https://www.client.carebridgeperth.com'

function parseJwtClaims(token: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length < 2) return null
  try {
    const payload = parts[1].replaceAll('-', '+').replaceAll('_', '/')
      .padEnd(Math.ceil(parts[1].length / 4) * 4, '=')
    return JSON.parse(atob(payload)) as Record<string, unknown>
  } catch { return null }
}

function firstName(full?: string | null): string | null {
  if (!full) return null
  const t = full.trim().split(/\s+/)[0]
  return t || null
}

function whenLabel(iso: string): string {
  return new Date(iso).toLocaleString('en-AU', {
    weekday: 'long', hour: 'numeric', minute: '2-digit', hour12: true,
    day: 'numeric', month: 'short',
  })
}

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  const claims = parseJwtClaims(token)
  if (claims?.role !== 'service_role') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } })
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const now = Date.now()
  const windows = [
    { kind: '24h' as const,
      clientTemplate: 'appointment-reminder',
      advocateTemplate: 'appointment-reminder-advocate',
      clientPush: { title: 'Appointment tomorrow', body: 'Your appointment is tomorrow. Check your calendar for the time and details.' },
      advocatePush: { title: 'Client appointment tomorrow', body: 'Your client has a confirmed appointment tomorrow.' },
      from: new Date(now + 23 * 3600 * 1000).toISOString(),
      to:   new Date(now + 25 * 3600 * 1000).toISOString(),
    },
    { kind: '4h' as const,
      clientTemplate: 'appointment-4h-reminder',
      advocateTemplate: 'appointment-4h-reminder-advocate',
      clientPush: { title: 'Appointment today', body: 'Your appointment is coming up soon. Check your calendar for the details.' },
      advocatePush: { title: 'Client appointment today', body: "Your client's appointment is coming up soon." },
      from: new Date(now + 3 * 3600 * 1000).toISOString(),
      to:   new Date(now + 5 * 3600 * 1000).toISOString(),
    },
  ]

  let checked = 0
  let emailsQueued = 0
  let pushSent = 0

  async function alreadySent(appointmentId: string, kind: string, channel: string, role: 'client' | 'advocate'): Promise<boolean> {
    const { data } = await supabase
      .from('appointment_notification_log')
      .select('appointment_id')
      .eq('appointment_id', appointmentId).eq('kind', kind)
      .eq('channel', channel).eq('recipient_role', role)
      .maybeSingle()
    return !!data
  }
  async function logSent(appointmentId: string, kind: string, channel: string, role: 'client' | 'advocate', recipientId: string) {
    await supabase.from('appointment_notification_log').insert({
      appointment_id: appointmentId, kind, channel, recipient_role: role, recipient_id: recipientId,
    })
  }
  async function pushTo(userId: string, payload: { title: string; body: string; url?: string; tag?: string }, appointmentId: string, kind: string, role: 'client' | 'advocate') {
    if (await alreadySent(appointmentId, kind, 'push', role)) return
    const { data: subs } = await supabase
      .from('push_subscriptions').select('id, endpoint, keys')
      .eq('user_id', userId).eq('is_active', true)
    if (!subs || subs.length === 0) return
    let any = false
    for (const s of subs) {
      try { await sendWebPush({ endpoint: s.endpoint as string, keys: s.keys as any }, payload); any = true; pushSent++ }
      catch (err) {
        if (isExpiredPushError(err)) await supabase.from('push_subscriptions').delete().eq('id', s.id)
        else console.error('push failed', err)
      }
    }
    if (any) await logSent(appointmentId, kind, 'push', role, userId)
  }

  for (const w of windows) {
    const { data: appts, error } = await supabase
      .from('appointments')
      .select('id, client_id, created_by, title, starts_at, location, provider_name, practitioner_name, client_visible_notes, advocate_private_notes, preparation_instructions, what_to_bring, notes, availability_request_id, outcome')
      .gte('starts_at', w.from).lte('starts_at', w.to)
      .eq('outcome', 'scheduled')
    if (error) { console.error('load failed', w.kind, error); continue }
    checked += appts?.length ?? 0

    for (const a of appts ?? []) {
      const [{ data: clientProf }, { data: advocateProf }] = await Promise.all([
        supabase.from('profiles').select('id, email, full_name').eq('id', a.client_id).maybeSingle(),
        supabase.from('profiles').select('id, email, full_name').eq('id', a.created_by).maybeSingle(),
      ])
      let clinicName: string | null = null
      if (a.availability_request_id) {
        const { data: ar } = await supabase.from('availability_requests')
          .select('clinic_name').eq('id', a.availability_request_id).maybeSingle()
        clinicName = (ar?.clinic_name as string | null) ?? null
      }
      const when = whenLabel(a.starts_at as string)
      const reviewUrl = a.availability_request_id
        ? `${APP_URL}/advocate/availability/${a.availability_request_id}/review`
        : `${APP_URL}/advocate/calendar`

      // Client email
      if (clientProf?.email && !(await alreadySent(a.id as string, w.kind, 'email', 'client'))) {
        const { error: e } = await supabase.functions.invoke('send-transactional-email', {
          body: {
            templateName: w.clientTemplate,
            recipientEmail: clientProf.email,
            idempotencyKey: `appt-${w.kind}-${a.id}`,
            templateData: {
              clientName: firstName(clientProf.full_name),
              title: a.title, whenLabel: when, location: a.location, notes: a.notes,
              clinicName, providerName: a.provider_name, practitionerName: a.practitioner_name,
              preparationInstructions: a.preparation_instructions, whatToBring: a.what_to_bring,
            },
          },
        })
        if (!e) { await logSent(a.id as string, w.kind, 'email', 'client', a.client_id as string); emailsQueued++ }
        else console.error('client email failed', w.kind, a.id, e)
      }

      // Advocate email
      if (advocateProf?.email && !(await alreadySent(a.id as string, w.kind, 'email', 'advocate'))) {
        const { error: e } = await supabase.functions.invoke('send-transactional-email', {
          body: {
            templateName: w.advocateTemplate,
            recipientEmail: advocateProf.email,
            idempotencyKey: `appt-${w.kind}-advocate-${a.id}`,
            templateData: {
              clientName: clientProf?.full_name || null,
              whenLabel: when, clinicName,
              providerName: a.provider_name, practitionerName: a.practitioner_name,
              location: a.location, advocatePrivateNotes: a.advocate_private_notes,
              reviewUrl,
            },
          },
        })
        if (!e) { await logSent(a.id as string, w.kind, 'email', 'advocate', a.created_by as string); emailsQueued++ }
        else console.error('advocate email failed', w.kind, a.id, e)
      }

      // Push
      await pushTo(a.client_id as string,
        { ...w.clientPush, url: `${APP_URL}/calendar`, tag: `appt-${w.kind}-${a.id}` },
        a.id as string, w.kind, 'client')
      await pushTo(a.created_by as string,
        { ...w.advocatePush, url: reviewUrl, tag: `appt-${w.kind}-adv-${a.id}` },
        a.id as string, w.kind, 'advocate')

      // In-app (client)
      if (!(await alreadySent(a.id as string, w.kind, 'inapp', 'client'))) {
        const res = await insertInAppNotification(supabase, {
          user_id: a.client_id as string,
          user_role: 'client',
          kind: w.kind === '24h' ? 'appointment_reminder_24h' : 'appointment_reminder_4h',
          title: w.clientPush.title,
          body: `${when}${clinicName ? ` · ${clinicName}` : ''}`,
          link: '/client/calendar',
          metadata: { appointment_id: a.id },
        })
        if (res.ok) await logSent(a.id as string, w.kind, 'inapp', 'client', a.client_id as string)
      }
      // In-app (advocate)
      if (!(await alreadySent(a.id as string, w.kind, 'inapp', 'advocate'))) {
        const res = await insertInAppNotification(supabase, {
          user_id: a.created_by as string,
          user_role: 'advocate',
          kind: w.kind === '24h' ? 'appointment_reminder_24h' : 'appointment_reminder_4h',
          title: w.advocatePush.title,
          body: `${clientProf?.full_name ? clientProf.full_name + ' · ' : ''}${when}`,
          link: a.availability_request_id
            ? `/advocate/availability/${a.availability_request_id}/review`
            : '/advocate/calendar',
          metadata: { appointment_id: a.id, availability_request_id: a.availability_request_id },
        })
        if (res.ok) await logSent(a.id as string, w.kind, 'inapp', 'advocate', a.created_by as string)
      }
    }
  }

  return new Response(JSON.stringify({ checked, emailsQueued, pushSent }), { headers: { 'Content-Type': 'application/json' } })
})
