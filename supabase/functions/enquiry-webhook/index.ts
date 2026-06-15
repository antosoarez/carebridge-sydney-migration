// Secure incoming webhook for the carebridgeperth.com marketing site.
// POSTs an enquiry which is stored under RLS and fires lifecycle automations
// when the advocate later converts it into a client.
//
// Auth: HMAC-SHA256 signature over the raw body using ENQUIRY_WEBHOOK_SECRET.
// Header: x-cb-signature: hex(hmac_sha256(secret, body))

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
    'Access-Control-Allow-Headers': 'Content-Type, x-cb-signature',
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

const RATE: Map<string, number[]> = new Map()
function rateLimited(ip: string): boolean {
  const now = Date.now()
  const WINDOW = 10 * 60 * 1000
  const MAX = 10
  const arr = (RATE.get(ip) ?? []).filter((t) => now - t < WINDOW)
  arr.push(now)
  RATE.set(ip, arr)
  return arr.length > MAX
}

async function verifyHmac(secret: string, rawBody: string, sigHeader: string | null): Promise<boolean> {
  if (!sigHeader) return false
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody))
  const expected = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('')
  const got = sigHeader.replace(/^sha256=/, '').toLowerCase().trim()
  if (got.length !== expected.length) return false
  // constant-time compare
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ got.charCodeAt(i)
  return diff === 0
}

function sanitize(s: string, max: number): string {
  return s.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max)
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin')
  const cors = corsFor(origin)

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return json({ ok: false, message: 'Method not allowed' }, 405, cors)

  const raw = await req.text()
  const secret = Deno.env.get('ENQUIRY_WEBHOOK_SECRET') ?? ''
  if (!secret) return json({ ok: false, message: 'Server not configured' }, 500, cors)

  const sig = req.headers.get('x-cb-signature')
  if (!(await verifyHmac(secret, raw, sig))) {
    return json({ ok: false, message: 'Invalid signature' }, 401, cors)
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  if (rateLimited(ip)) return json({ ok: false, message: 'Too many requests' }, 429, cors)

  let body: Record<string, unknown>
  try { body = JSON.parse(raw) } catch { return json({ ok: false, message: 'Invalid JSON' }, 400, cors) }

  if (((body._gotcha ?? '') as string).toString().trim().length > 0) {
    return json({ ok: true }, 200, cors)
  }

  const name = sanitize((body.name ?? '').toString(), 120)
  const email = sanitize((body.email ?? '').toString().toLowerCase(), 255)
  const phone = sanitize((body.phone ?? '').toString(), 40)
  const message = sanitize((body.message ?? '').toString(), 2000)
  const source = sanitize((body.source ?? 'marketing_site').toString(), 60)
  const service_interest = sanitize((body.service_interest ?? '').toString(), 120)
  const preferred_contact = sanitize((body.preferred_contact ?? '').toString(), 30)

  if (!name) return json({ ok: false, message: 'Name required' }, 400, cors)
  if (!isEmail(email)) return json({ ok: false, message: 'Valid email required' }, 400, cors)
  if (!message) return json({ ok: false, message: 'Message required' }, 400, cors)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  const { error } = await supabase.from('inbound_messages').insert({
    name, email, phone: phone || null, message,
    source,
    service_interest: service_interest || null,
    preferred_contact: preferred_contact || null,
    ip_address: ip,
  })

  if (error) {
    console.error('enquiry-webhook insert error', error)
    return json({ ok: false, message: 'Failed to store enquiry' }, 500, cors)
  }

  return json({ ok: true }, 200, cors)
})
