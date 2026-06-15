// Queues task reminders. Sends a reminder when an open task is due tomorrow,
// and a follow-up when it becomes overdue (due yesterday). Idempotency keys
// derived from task id + bucket make re-runs safe; runs hourly via pg_cron.
import { createClient } from 'npm:@supabase/supabase-js@2'

function parseJwtClaims(token: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length < 2) return null
  try {
    const payload = parts[1].replaceAll('-', '+').replaceAll('_', '/')
      .padEnd(Math.ceil(parts[1].length / 4) * 4, '=')
    return JSON.parse(atob(payload)) as Record<string, unknown>
  } catch { return null }
}

function todayISO(offsetDays = 0): string {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() + offsetDays)
  return d.toISOString().slice(0, 10)
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

  // Two buckets: "due tomorrow" and "overdue by one day".
  const buckets: Array<{ date: string; bucket: 'due-tomorrow' | 'overdue-1d'; label: string }> = [
    { date: todayISO(1), bucket: 'due-tomorrow', label: 'Tomorrow' },
    { date: todayISO(-1), bucket: 'overdue-1d', label: '1 day overdue' },
  ]

  let queued = 0
  let checked = 0

  for (const b of buckets) {
    const { data: tasks, error } = await supabase
      .from('tasks')
      .select('id, client_id, title, description, due_date, status')
      .eq('status', 'to_do')
      .eq('due_date', b.date)

    if (error) {
      console.error('Failed to load tasks', b.bucket, error)
      continue
    }
    checked += tasks?.length ?? 0

    for (const t of tasks ?? []) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('email, full_name')
        .eq('id', t.client_id)
        .maybeSingle()
      if (!prof?.email) continue

      const { error: invokeErr } = await supabase.functions.invoke('send-transactional-email', {
        body: {
          templateName: 'task-reminder',
          recipientEmail: prof.email,
          idempotencyKey: `task-${b.bucket}-${t.id}`,
          templateData: {
            clientName: prof.full_name?.split(' ')[0] || null,
            title: t.title,
            dueLabel: b.label,
            description: t.description,
          },
        },
      })
      if (invokeErr) console.error('Task reminder enqueue failed', t.id, invokeErr)
      else queued++
    }
  }

  // ── reminder_at bucket: any open task whose reminder_at has just passed
  // (within the last 70 minutes) and hasn't been emailed yet.
  const now = new Date()
  const windowStart = new Date(now.getTime() - 70 * 60 * 1000).toISOString()
  const { data: dueReminders, error: remErr } = await supabase
    .from('tasks')
    .select('id, client_id, title, description, reminder_at, status, reminder_sent_at')
    .eq('status', 'to_do')
    .is('reminder_sent_at', null)
    .not('reminder_at', 'is', null)
    .lte('reminder_at', now.toISOString())
    .gte('reminder_at', windowStart)

  if (remErr) {
    console.error('Failed to load reminder_at tasks', remErr)
  } else {
    for (const t of dueReminders ?? []) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('email, full_name')
        .eq('id', t.client_id)
        .maybeSingle()
      if (!prof?.email) continue
      const { error: invokeErr } = await supabase.functions.invoke('send-transactional-email', {
        body: {
          templateName: 'task-reminder',
          recipientEmail: prof.email,
          idempotencyKey: `task-reminder-at-${t.id}-${t.reminder_at}`,
          templateData: {
            clientName: prof.full_name?.split(' ')[0] || null,
            title: t.title,
            dueLabel: 'Now',
            description: t.description,
          },
        },
      })
      if (invokeErr) {
        console.error('Reminder_at email enqueue failed', t.id, invokeErr)
      } else {
        await supabase.from('tasks').update({ reminder_sent_at: now.toISOString() }).eq('id', t.id)
        queued++
      }
    }
  }

  return new Response(JSON.stringify({ checked, queued }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
