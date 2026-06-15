// Returns the VAPID public key for the browser to use when subscribing
// to Web Push. The public key is safe to expose (it's the application
// server's identity for push); the matching private key stays in secrets.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

Deno.serve((req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  const key = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
  return new Response(JSON.stringify({ key }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 200,
  })
})
