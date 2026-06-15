// Public enquiry form endpoint for the carebridgeperth.com marketing site.
// No HMAC (form runs in the browser). Protected by CORS allow-list, honeypot,
// IP rate limiting, input sanitisation, and validation.
// Inserts into inbound_messages (same shape as enquiry-webhook) and emails a
// copy to hello@carebridgeperth.com via Resend.

import { createClient } from 'npm:@supabase/supabase-js@2'

const ALLOWED_ORIGINS = new Set<string>([
  'https://carebridgeperth.com',
  'https://www.carebridgeperth.com',
])

function corsFor(origin: string | null): HeadersInit {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : ''
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  }
}

function json(body: unknown, status: number, cors: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
}

function sanitize(s: string, max: number): string {
  return s.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max)
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const RATE: Map<string, number[]> = new Map()
function rateLimited(ip: string): boolean {
  const now = Date.now()
  const WINDOW = 10 * 60 * 1000
  const MAX = 5
  const arr = (RATE.get(ip) ?? []).filter((t) => now - t < WINDOW)
  arr.push(now)
  RATE.set(ip, arr)
  return arr.length > MAX
}

async function sendCopyEmail(input: {
  name: string
  email: string
  phone: string
  language: string
  message: string
  service_interest: string
  preferred_contact: string
}): Promise<void> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) {
    console.warn('public-enquiry-form: RESEND_API_KEY missing; skipping copy email')
    return
  }

  const rows: Array<[string, string]> = [
    ['Name', input.name],
    ['Email', input.email],
    ['Phone', input.phone || '—'],
    ['Language', input.language || '—'],
    ['Service interest', input.service_interest || '—'],
    ['Preferred contact', input.preferred_contact || '—'],
  ]

  const html = `
    <div style="font-family:Arial,sans-serif;color:#0f172a;max-width:560px;">
      <h2 style="margin:0 0 12px;">New enquiry from carebridgeperth.com</h2>
      <table style="border-collapse:collapse;width:100%;margin-bottom:16px;">
        ${rows
          .map(
            ([k, v]) =>
              `<tr><td style="padding:6px 8px;border:1px solid #e2e8f0;font-weight:600;background:#f8fafc;">${escapeHtml(k)}</td><td style="padding:6px 8px;border:1px solid #e2e8f0;">${escapeHtml(v)}</td></tr>`,
          )
          .join('')}
      </table>
      <div style="white-space:pre-wrap;padding:12px;border:1px solid #e2e8f0;border-radius:8px;background:#ffffff;">${escapeHtml(input.message)}</div>
      <p style="color:#64748b;font-size:12px;margin-top:16px;">Log in to CareBridge to reply and convert this enquiry into a client.</p>
    </div>
  `

  const text = [
    'New enquiry from carebridgeperth.com',
    '',
    ...rows.map(([k, v]) => `${k}: ${v}`),
    '',
    'Message:',
    input.message,
    '',
    'Log in to CareBridge to reply.',
  ].join('\n')

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: 'CareBridge Enquiries <enquiries@notify.carebridgeperth.com>',
        to: ['hello@carebridgeperth.com'],
        reply_to: input.email,
        subject: `New enquiry — ${input.name}`,
        html,
        text,
      }),
    })
    if (!res.ok) {
      const body = await res.text()
      console.error('public-enquiry-form: Resend send failed', res.status, body)
    }
  } catch (err) {
    console.error('public-enquiry-form: Resend send threw', err)
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin')
  const cors = corsFor(origin)

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return json({ ok: false, message: 'Method not allowed' }, 405, cors)

  // Lock to allow-listed origins (browser form only)
  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    return json({ ok: false, message: 'Origin not allowed' }, 403, cors)
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  if (rateLimited(ip)) return json({ ok: false, message: 'Too many requests' }, 429, cors)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, message: 'Invalid JSON' }, 400, cors)
  }

  // Honeypot — silently succeed for bots
  if (((body._gotcha ?? body.website ?? '') as string).toString().trim().length > 0) {
    return json({ ok: true }, 200, cors)
  }

  const name = sanitize((body.name ?? '').toString(), 120)
  const email = sanitize((body.email ?? '').toString().toLowerCase(), 255)
  const phone = sanitize((body.phone ?? '').toString(), 40)
  const message = sanitize((body.message ?? '').toString(), 2000)
  const language = sanitize((body.language ?? '').toString(), 30)
  const service_interest = sanitize((body.service_interest ?? '').toString(), 120)
  const preferred_contact = sanitize((body.preferred_contact ?? '').toString(), 30)

  if (!name) return json({ ok: false, message: 'Name required' }, 400, cors)
  if (!isEmail(email)) return json({ ok: false, message: 'Valid email required' }, 400, cors)
  if (!message) return json({ ok: false, message: 'Message required' }, 400, cors)
  if (message.length < 5) return json({ ok: false, message: 'Message too short' }, 400, cors)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  const { error } = await supabase.from('inbound_messages').insert({
    name,
    email,
    phone: phone || null,
    message,
    source: 'marketing_site',
    service_interest: service_interest || null,
    preferred_contact: preferred_contact || (language ? `language:${language}` : null),
    ip_address: ip,
  })

  if (error) {
    console.error('public-enquiry-form insert error', error)
    return json({ ok: false, message: 'Failed to store enquiry' }, 500, cors)
  }

  // Best-effort copy email; never block the response on email failure
  await sendCopyEmail({
    name,
    email,
    phone,
    language,
    message,
    service_interest,
    preferred_contact,
  })

  return json({ ok: true }, 200, cors)
})
