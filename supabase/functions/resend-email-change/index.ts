// Re-sends the verification email for a pending email-change request, using
// the same token (still valid). If expired, asks the caller to start again.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendViaResend } from "../_shared/send-via-resend.ts";
import {
  verifyEmailChangeHtml,
  verifyEmailChangeText,
} from "../_shared/email-change-emails.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (p: unknown, s = 200) =>
  new Response(JSON.stringify(p), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const SITE_URL = Deno.env.get("SITE_URL") ?? "https://www.client.carebridgeperth.com";

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "Please sign in again." }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ error: "Please sign in again." }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json().catch(() => ({}));
    const requestId = String(body.request_id ?? "").trim();
    // The raw token is only kept by the email recipient, so we can't re-send the
    // same link from the server — we issue a *new* row instead via the request
    // function. To keep the simple "resend" UX, we ask the request endpoint to
    // re-create a pending row using the same new_email.
    if (!requestId) return json({ error: "Missing request." }, 400);

    const { data: row } = await admin
      .from("email_change_requests")
      .select("id, user_id, new_email, old_email, status, expires_at, token_hash")
      .eq("id", requestId)
      .maybeSingle();
    if (!row) return json({ error: "Not found." }, 404);
    if (row.status !== "pending") return json({ error: "This request isn't pending — start a new one." }, 400);
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await admin.from("email_change_requests").update({ status: "expired" }).eq("id", row.id);
      return json({ error: "This link has expired. Please start a new request." }, 400);
    }

    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", u.user.id);
    const isAdvocate = !!roles?.some((r) => r.role === "advocate");
    if (u.user.id !== row.user_id && !isAdvocate) return json({ error: "Not allowed." }, 403);

    // Mint a new token, replace the hash, push the expiry forward.
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const rawToken = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
    const hashBuf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawToken));
    const tokenHash = Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");

    await admin
      .from("email_change_requests")
      .update({
        token_hash: tokenHash,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq("id", row.id);

    const { data: targetUser } = await admin.auth.admin.getUserById(row.user_id);
    const fullName = (targetUser?.user?.user_metadata?.full_name as string | undefined) ?? undefined;
    const verifyLink = `${SITE_URL.replace(/\/$/, "")}/verify-email-change?token=${rawToken}`;

    await sendViaResend({
      to: row.new_email,
      subject: "Please confirm your new CareBridge email",
      html: verifyEmailChangeHtml(verifyLink, row.new_email, fullName),
      text: verifyEmailChangeText(verifyLink, row.new_email, fullName),
    });

    return json({ ok: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
