// Queues client payment reminders. For each outstanding payment (invoice
// given, not yet paid), sends a first reminder once invoice is 7+ days old
// and at most one follow-up after 21+ days. Stops once marked paid.
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

function fmtAmount(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
  } catch { return `$${amount.toFixed(0)} ${currency}` }
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

  const { data: settings } = await supabase
    .from('payment_settings').select('bank_details, currency').eq('id', 1).maybeSingle()
  const bankDetails = settings?.bank_details ?? ''
  const currency = settings?.currency ?? 'AUD'

  const now = Date.now()
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000
  const TWENTY_ONE_DAYS = 21 * 24 * 60 * 60 * 1000

  const { data: payments, error } = await supabase
    .from('client_payments')
    .select('id, client_id, label, amount, invoice_given_at')
    .eq('invoice_given', true)
    .eq('paid', false)
    .not('invoice_given_at', 'is', null)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }

  let queued = 0
  let checked = 0

  for (const p of payments ?? []) {
    checked++
    const ageMs = now - new Date(p.invoice_given_at!).getTime()
    if (ageMs < SEVEN_DAYS) continue

    const { data: log } = await supabase
      .from('payment_reminders_log')
      .select('kind')
      .eq('payment_id', p.id)

    const sentKinds = new Set((log ?? []).map((l: any) => l.kind))
    let kindToSend: 'client_email_1' | 'client_email_2' | null = null
    let isFollowUp = false

    if (!sentKinds.has('client_email_1')) {
      kindToSend = 'client_email_1'
      isFollowUp = false
    } else if (ageMs >= TWENTY_ONE_DAYS && !sentKinds.has('client_email_2')) {
      kindToSend = 'client_email_2'
      isFollowUp = true
    }
    if (!kindToSend) continue

    const { data: prof } = await supabase
      .from('profiles').select('email, full_name').eq('id', p.client_id).maybeSingle()
    if (!prof?.email) continue

    const { error: invokeErr } = await supabase.functions.invoke('send-transactional-email', {
      body: {
        templateName: 'payment-reminder',
        recipientEmail: prof.email,
        idempotencyKey: `payment-${kindToSend}-${p.id}`,
        templateData: {
          clientName: prof.full_name?.split(' ')[0] || null,
          label: p.label,
          amount: fmtAmount(Number(p.amount), currency),
          bankDetails,
          isFollowUp,
        },
      },
    })
    if (invokeErr) {
      console.error('Payment reminder enqueue failed', p.id, invokeErr)
      continue
    }
    await supabase.from('payment_reminders_log').insert({
      payment_id: p.id, client_id: p.client_id, kind: kindToSend,
    })
    queued++
  }

  return new Response(JSON.stringify({ checked, queued }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
