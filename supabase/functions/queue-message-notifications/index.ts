// Scheduled: scans for unread messages and queues notification emails to
// recipients. Sends at most two emails per (recipient, thread) per round of
// unread messages: email 1 immediately, email 2 after 24h. The log is
// cleared when the recipient reads the thread (see mark_thread_read), so
// the cycle naturally resets. No message body content is ever included.

import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  sendViaResend,
  newMessageEmailHtml,
  newMessageEmailText,
  newMessageEmailSubject,
} from '../_shared/send-via-resend.ts'
import { sendWebPush, isExpiredPushError } from '../_shared/web-push.ts'
import { insertInAppNotification } from '../_shared/inapp-notify.ts'


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

function withinQuietHours(nowUtc: Date, tz: string, start: string, end: string): boolean {
  // Render current local time as HH:MM in the recipient's timezone, then
  // compare against start/end with overnight wrap.
  try {
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hour12: false, hour: '2-digit', minute: '2-digit',
    })
    const parts = fmt.formatToParts(nowUtc)
    const hh = parts.find(p => p.type === 'hour')?.value ?? '00'
    const mm = parts.find(p => p.type === 'minute')?.value ?? '00'
    const cur = Number(hh) * 60 + Number(mm)
    const [sh, sm] = start.split(':').map(Number)
    const [eh, em] = end.split(':').map(Number)
    const s = sh * 60 + sm
    const e = eh * 60 + em
    if (s === e) return false
    if (s < e) return cur >= s && cur < e
    // overnight wrap
    return cur >= s || cur < e
  } catch {
    return false
  }
}

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  const claims = parseJwtClaims(token)
  if (claims?.role !== 'service_role') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403, headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const MESSAGES_URL = 'https://www.client.carebridgeperth.com/messages'
  const SIXTY_MIN_MS = 60 * 60 * 1000
  const TWENTY_FOUR_H_MS = 24 * 60 * 60 * 1000
  const now = new Date()
  const nowMs = now.getTime()

  // Pull all threads (advocate count is small; this is fine for a 5-min cron)
  const { data: threads, error: tErr } = await supabase
    .from('message_threads')
    .select('id, client_id, advocate_id')
  if (tErr) {
    return new Response(JSON.stringify({ error: tErr.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }

  let checked = 0
  let queued = 0
  let skippedQuiet = 0
  let skippedToggleOff = 0
  let pushed = 0
  let pushSkippedNoSubs = 0
  let pushFailed = 0

  const trace: Array<Record<string, unknown>> = []

  for (const t of threads ?? []) {
    for (const recipient of [
      { id: t.client_id, otherId: t.advocate_id },
      { id: t.advocate_id, otherId: t.client_id },
    ]) {
      checked++

      // Oldest unread message from the other party in this thread
      const { data: oldest, error: oldestErr } = await supabase
        .from('messages')
        .select('id, created_at')
        .eq('thread_id', t.id)
        .neq('sender_id', recipient.id)
        .is('read_at', null)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (oldestErr) {
        trace.push({ thread: t.id, recipient: recipient.id, stage: 'oldest_query_error', err: oldestErr.message })
        continue
      }
      if (!oldest) continue
      trace.push({ thread: t.id, recipient: recipient.id, stage: 'candidate_found', message_id: oldest.id })

      // Preferences (defense: insert default row if somehow missing)
      const { data: prefs } = await supabase
        .from('notification_settings')
        .select('email_on_new_message, push_on_new_message, quiet_hours_enabled, quiet_start, quiet_end, timezone')
        .eq('user_id', recipient.id)
        .maybeSingle()

      const settings = prefs ?? {
        email_on_new_message: true,
        push_on_new_message: false,
        quiet_hours_enabled: true,
        quiet_start: '22:00',
        quiet_end: '07:00',
        timezone: 'Australia/Perth',
      }

      if (!settings.email_on_new_message && !settings.push_on_new_message) {
        skippedToggleOff++
        continue
      }

      // Existing notification log for this (recipient, thread)
      const { data: log } = await supabase
        .from('message_notification_log')
        .select('email_number, sent_at')
        .eq('thread_id', t.id)
        .eq('user_id', recipient.id)
        .order('sent_at', { ascending: true })

      const email1 = log?.find(l => l.email_number === 1)
      const email2 = log?.find(l => l.email_number === 2)

      let emailNumberToSend: 1 | 2 | null = null
      let isFollowUp = false

      if (!email1) {
        // Email 1 — but enforce the 60-minute cap against any prior send.
        const last = log && log.length > 0 ? log[log.length - 1] : null
        if (last && nowMs - new Date(last.sent_at).getTime() < SIXTY_MIN_MS) {
          trace.push({ thread: t.id, recipient: recipient.id, stage: 'skip_60min_cap' })
          continue
        }
        emailNumberToSend = 1
      } else if (!email2 && nowMs - new Date(email1.sent_at).getTime() >= TWENTY_FOUR_H_MS) {
        emailNumberToSend = 2
        isFollowUp = true
      } else {
        trace.push({ thread: t.id, recipient: recipient.id, stage: 'skip_already_sent' })
        continue
      }

      // Quiet hours — defer; will retry next tick
      const quietStart = (settings.quiet_start as string).slice(0, 5)
      const quietEnd = (settings.quiet_end as string).slice(0, 5)
      if (
        settings.quiet_hours_enabled &&
        withinQuietHours(now, settings.timezone || 'Australia/Perth', quietStart, quietEnd)
      ) {
        skippedQuiet++
        trace.push({ thread: t.id, recipient: recipient.id, stage: 'skip_quiet_hours' })
        continue
      }

      // Defense-in-depth: confirm membership (already true by construction)
      if (recipient.id !== t.client_id && recipient.id !== t.advocate_id) continue

      // Resolve names
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .in('id', [recipient.id, recipient.otherId])

      const recipientProf = profs?.find(p => p.id === recipient.id)
      const senderProf = profs?.find(p => p.id === recipient.otherId)
      if (!recipientProf?.email) {
        trace.push({ thread: t.id, recipient: recipient.id, stage: 'skip_no_recipient_email' })
        continue
      }

      const tplInput = {
        recipientName: firstName(recipientProf.full_name),
        senderName: firstName(senderProf?.full_name) || 'your CareBridge contact',
        isFollowUp,
        messagesUrl: MESSAGES_URL,
      }

      let emailOk = false
      if (settings.email_on_new_message) {
        trace.push({ thread: t.id, recipient: recipient.id, stage: 'sending_resend', email_number: emailNumberToSend })
        try {
          await sendViaResend({
            to: recipientProf.email,
            subject: newMessageEmailSubject(tplInput),
            html: newMessageEmailHtml(tplInput),
            text: newMessageEmailText(tplInput),
          })
          emailOk = true
          trace.push({ thread: t.id, recipient: recipient.id, stage: 'resend_ok' })
          queued++
        } catch (err) {
          console.error('msg notif resend failed', t.id, recipient.id, err)
          trace.push({ thread: t.id, recipient: recipient.id, stage: 'resend_error', err: String((err as Error)?.message ?? err) })
        }
      }

      // Web Push — gated independently by push_on_new_message, same cadence
      // rules as email (already enforced above). Payload contains ONLY sender
      // first name + generic CTA — never the message body.
      let anyPushSent = false
      if (settings.push_on_new_message) {
        const { data: subs } = await supabase
          .from('push_subscriptions')
          .select('id, endpoint, keys')
          .eq('user_id', recipient.id)
          .eq('is_active', true)
        if (!subs || subs.length === 0) {
          pushSkippedNoSubs++
        } else {
          for (const sub of subs) {
            try {
              await sendWebPush(
                { endpoint: sub.endpoint, keys: sub.keys as { p256dh: string; auth: string } },
                {
                  title: `New message from ${tplInput.senderName}`,
                  body: 'Tap to read in CareBridge',
                  url: MESSAGES_URL,
                  tag: `thread-${t.id}`,
                }
              )
              await supabase
                .from('push_subscriptions')
                .update({ last_used_at: new Date().toISOString() })
                .eq('id', sub.id)
              anyPushSent = true
              pushed++
              trace.push({ thread: t.id, recipient: recipient.id, stage: 'push_ok' })
            } catch (err) {
              pushFailed++
              if (isExpiredPushError(err)) {
                await supabase
                  .from('push_subscriptions')
                  .update({ is_active: false })
                  .eq('id', sub.id)
              }
              trace.push({
                thread: t.id, recipient: recipient.id, stage: 'push_error',
                err: String((err as Error)?.message ?? err),
              })
            }
          }
        }
      }

      // Log this notification round if EITHER channel succeeded — this
      // advances the 1→2 cadence and respects the 60-min cap for both.
      if (emailOk || anyPushSent) {
        await supabase.from('message_notification_log').insert({
          user_id: recipient.id,
          thread_id: t.id,
          email_number: emailNumberToSend,
        })

        // In-app row — gentle, no body content, links to messages.
        await insertInAppNotification(supabase, {
          user_id: recipient.id,
          user_role: recipient.id === t.client_id ? 'client' : 'advocate',
          kind: 'new_message',
          title: `New message from ${tplInput.senderName}`,
          body: 'Tap to read in CareBridge',
          link: recipient.id === t.client_id ? '/client/messages' : '/advocate/messages',
          metadata: { thread_id: t.id },
        })

        // When the 24h follow-up (email 2) fires for a CLIENT recipient,
        // also raise an advocate-side "Needs attention" signal. The partial
        // unique index makes this a silent no-op if an active row already
        // exists; the row auto-resolves when the client reads the thread,
        // or the advocate can mark it as noted manually.
        if (emailNumberToSend === 2 && recipient.id === t.client_id) {
          const { error: sigErr } = await supabase
            .from('attention_signals')
            .insert({
              client_id: recipient.id,
              thread_id: t.id,
              signal_type: 'unread_messages_24h',
            })
          if (sigErr && !/duplicate key|unique/i.test(sigErr.message)) {
            console.error('attention_signal insert failed', t.id, recipient.id, sigErr)
          }
        }
      }
    }
  }

  console.log(JSON.stringify({
    event: 'queue-message-notifications.summary',
    checked, queued, skippedQuiet, skippedToggleOff,
    pushed, pushSkippedNoSubs, pushFailed,
    trace,
    ts: now.toISOString(),
  }))

  return new Response(JSON.stringify({
    checked, queued, skippedQuiet, skippedToggleOff,
    pushed, pushSkippedNoSubs, pushFailed,
  }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
