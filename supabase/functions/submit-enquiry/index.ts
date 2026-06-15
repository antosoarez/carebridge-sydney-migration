// Public enquiry intake endpoint.
// Called by the external carebridgeperth.com marketing site (replacing Formspree).
// NOT used by the in-app /contact page — that still inserts directly via anon RLS.

import { createClient } from 'npm:@supabase/supabase-js@2'

const ALLOWED_ORIGINS = new Set<string>([
  'https://carebridgeperth.com',
  'https://www.carebridgeperth.com',
])

const INBOX_BASE_URL = 'https://www.client.carebridgeperth.com/advocate/messages'

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

// Tiny in-memory rate limit (best-effort, per warm instance).
// 5 requests / 10 minutes / IP.
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

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin')
  const cors = corsFor(origin)

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors })
  }

  if (req.method !== 'POST') {
    return json({ ok: false, message: 'Method not allowed' }, 405, cors)
  }

  // Reject requests whose Origin we don't recognise (defence in depth — browsers
  // already enforce CORS, but non-browser clients ignore it).
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return json({ ok: false, message: 'Origin not allowed' }, 403, cors)
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, message: 'Invalid JSON' }, 400, cors)
  }

  // Honeypot — fake-success silently
  const gotcha = (body._gotcha ?? '').toString().trim()
  if (gotcha.length > 0) {
    return json({ ok: true }, 200, cors)
  }

  const name = (body.name ?? '').toString().trim()
  const email = (body.email ?? '').toString().trim().toLowerCase()
  const phone = body.phone ? body.phone.toString().trim() : null
  const message = body.message ? body.message.toString().trim() : null
  const preferredContact = body.preferred_contact ? body.preferred_contact.toString().trim().slice(0, 200) : null
  const serviceInterest = body.service_interest ? body.service_interest.toString().trim().slice(0, 200) : null

  if (!name || name.length > 200) {
    return json({ ok: false, message: 'Please enter your name.' }, 400, cors)
  }
  if (!email || email.length > 320 || !isEmail(email)) {
    return json({ ok: false, message: 'Please enter a valid email.' }, 400, cors)
  }
  if (message && message.length > 5000) {
    return json({ ok: false, message: 'Message is too long.' }, 400, cors)
  }

  // Rate-limit by IP
  const ip = (req.headers.get('cf-connecting-ip')
    || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown') as string
  if (rateLimited(ip)) {
    return json({ ok: false, message: 'Too many submissions. Try again shortly.' }, 429, cors)
  }

  const userAgent = req.headers.get('user-agent') ?? null

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return json({ ok: false, message: 'Server misconfigured' }, 500, cors)
  }

  const admin = createClient(supabaseUrl, serviceKey)

  const { data: inserted, error: insertErr } = await admin
    .from('inbound_messages')
    .insert({
      name,
      email,
      phone,
      message,
      subject: 'Website enquiry',
      source: 'website_form',
      enquiry_status: 'New',
      preferred_contact: preferredContact,
      service_interest: serviceInterest,
      ip_address: ip === 'unknown' ? null : ip,
      user_agent: userAgent,
    })
    .select('id')
    .single()

  if (insertErr || !inserted) {
    console.error('submit-enquiry insert failed', insertErr)
    return json({ ok: false, message: 'Could not save your message. Please try again.' }, 500, cors)
  }

  // Fire-and-forget notification email (don't fail the request if it errors)
  try {
    await admin.functions.invoke('send-transactional-email', {
      body: {
        templateName: 'new-enquiry-notification',
        recipientEmail: 'hello@carebridgeperth.com',
        idempotencyKey: `enquiry-notify-${inserted.id}`,
        templateData: {
          name,
          email,
          phone,
          message,
          source: 'website_form',
          preferredContact,
          serviceInterest,
          inboxUrl: `${INBOX_BASE_URL}?enquiry=${inserted.id}`,
        },
      },
    })
  } catch (e) {
    console.error('submit-enquiry notify email failed', e)
  }

  return json(
    { ok: true, message: "Thank you — we'll be in touch soon." },
    200,
    cors,
  )
})
