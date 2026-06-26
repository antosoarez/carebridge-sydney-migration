// Stripe webhook: on checkout.session.completed, record the payment and flip
// the client_payments row to paid -> true, which fires trg_payment_received
// (lifecycle -> Active, portal access, begin-work task, notifications).
// Verifies the Stripe signature; idempotent via stripe_session_id. verify_jwt
// is disabled (Stripe calls this) — auth is the signature check.
import Stripe from "npm:stripe@16";
import { createClient } from "npm:@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});
const cryptoProvider = Stripe.createSubtleCryptoProvider();

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405 });
  }

  const sig = req.headers.get("stripe-signature");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const body = await req.text();

  if (!sig || !webhookSecret) {
    return new Response(JSON.stringify({ error: "missing signature/secret" }), { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret, undefined, cryptoProvider);
  } catch (err) {
    console.error("stripe-webhook signature verification failed", err);
    return new Response(JSON.stringify({ error: "invalid signature" }), { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    // Acknowledge other events without acting.
    return new Response(JSON.stringify({ received: true, ignored: event.type }), { status: 200 });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const clientId = session.client_reference_id;          // set via ?client_reference_id=<client_id>
  const sessionId = session.id;
  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
  const amount = (session.amount_total ?? 0) / 100;       // cents -> AUD
  const currency = (session.currency ?? "aud").toUpperCase();

  if (!clientId) {
    console.error("stripe-webhook: missing client_reference_id on session", sessionId);
    return new Response(JSON.stringify({ received: true, error: "no client_reference_id" }), { status: 200 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Insert the row (paid=false) idempotently, then flip to paid=true so the
  // AFTER UPDATE automation trigger fires exactly once.
  const { error: insErr } = await supabase.from("client_payments").insert({
    client_id: clientId,
    kind: "custom",
    label: "CareBridge service (Stripe)",
    amount,
    currency,
    invoice_given: true,
    invoice_given_at: new Date().toISOString(),
    paid: false,
    stripe_session_id: sessionId,
    stripe_payment_intent_id: paymentIntentId,
  });
  // 23505 = unique violation (already ingested) -> safe to continue to the update.
  if (insErr && insErr.code !== "23505") {
    console.error("stripe-webhook insert error", insErr);
    return new Response(JSON.stringify({ error: "insert failed" }), { status: 500 });
  }

  const { data: updated, error: updErr } = await supabase
    .from("client_payments")
    .update({ paid: true, paid_at: new Date().toISOString(), stripe_payment_intent_id: paymentIntentId })
    .eq("stripe_session_id", sessionId)
    .eq("paid", false)
    .select("id");

  if (updErr) {
    console.error("stripe-webhook update error", updErr);
    return new Response(JSON.stringify({ error: "update failed" }), { status: 500 });
  }

  return new Response(
    JSON.stringify({ received: true, marked_paid: (updated?.length ?? 0) > 0, session: sessionId }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
