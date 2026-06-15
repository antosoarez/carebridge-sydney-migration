// Public endpoint hit by the verification link sent to the NEW email.
// Validates the token, swaps the auth user's email, mirrors it on profiles,
// and marks the request verified. No JWT required.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (p: unknown, s = 200) =>
  new Response(JSON.stringify(p), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    let token = "";
    if (req.method === "GET") {
      token = new URL(req.url).searchParams.get("token") ?? "";
    } else {
      const body = await req.json().catch(() => ({}));
      token = String(body.token ?? "");
    }
    token = token.trim();
    if (!token) return json({ error: "This link is missing its confirmation code." }, 400);

    const tokenHash = await sha256Hex(token);
    const { data: row } = await admin
      .from("email_change_requests")
      .select("id, user_id, new_email, old_email, status, expires_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (!row) return json({ error: "This link is invalid or has already been used." }, 400);
    if (row.status !== "pending") {
      return json({ error: "This link has already been used or cancelled. If you still need to change your email, please start again." }, 400);
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await admin
        .from("email_change_requests")
        .update({ status: "expired" })
        .eq("id", row.id);
      return json({ error: "This link has expired. Please start the change again." }, 400);
    }

    // Make sure no one else has claimed this email in the meantime
    const { data: existingByEmail } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const conflict = existingByEmail?.users?.find(
      (u) => u.email && u.email.toLowerCase() === row.new_email && u.id !== row.user_id,
    );
    if (conflict) {
      await admin
        .from("email_change_requests")
        .update({ status: "failed", error_message: "Email already taken" })
        .eq("id", row.id);
      return json({ error: "Another account has since claimed that email. Please try a different one." }, 409);
    }

    const { error: updErr } = await admin.auth.admin.updateUserById(row.user_id, {
      email: row.new_email,
      email_confirm: true,
    });
    if (updErr) {
      await admin
        .from("email_change_requests")
        .update({ status: "failed", error_message: updErr.message })
        .eq("id", row.id);
      return json({ error: "We couldn't update the email — please try again." }, 500);
    }

    await admin
      .from("profiles")
      .update({ email: row.new_email })
      .eq("id", row.user_id);

    await admin
      .from("email_change_requests")
      .update({ status: "verified", verified_at: new Date().toISOString() })
      .eq("id", row.id);

    return json({ ok: true, email: row.new_email });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
