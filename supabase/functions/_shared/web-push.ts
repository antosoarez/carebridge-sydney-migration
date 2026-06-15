// Web Push dispatch helper, wrapping the `web-push` npm package via the
// Deno `npm:` specifier. VAPID identity is taken from edge function secrets.
//
// Payloads contain ONLY a sender first name and a generic CTA — never the
// message body — to keep health-adjacent content out of OS notifications.
import webpush from 'npm:web-push@3.6.7'

type Sub = {
  endpoint: string
  keys: { p256dh: string; auth: string } | Record<string, string>
}

type Payload = {
  title: string
  body: string
  url?: string
  tag?: string
}

let configured = false
function ensureConfigured() {
  if (configured) return
  const pub = Deno.env.get('VAPID_PUBLIC_KEY')
  const priv = Deno.env.get('VAPID_PRIVATE_KEY')
  const subject = Deno.env.get('VAPID_SUBJECT') || 'mailto:hello@carebridgeperth.com'
  if (!pub || !priv) {
    throw new Error('VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set')
  }
  webpush.setVapidDetails(subject, pub, priv)
  configured = true
}

export async function sendWebPush(sub: Sub, payload: Payload): Promise<void> {
  ensureConfigured()
  const body = JSON.stringify(payload)
  await webpush.sendNotification(
    { endpoint: sub.endpoint, keys: sub.keys as { p256dh: string; auth: string } },
    body,
    { TTL: 60 * 60 }
  )
}

export function isExpiredPushError(err: unknown): boolean {
  const status = (err as { statusCode?: number; status?: number })?.statusCode
    ?? (err as { statusCode?: number; status?: number })?.status
  return status === 404 || status === 410
}
