// Verifies a one-time MFA recovery code and removes all TOTP factors for the
// authenticated user so they can complete sign-in without their authenticator.
// Requires the user to already be signed in (aal1 session).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing auth" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = userData.user.id;

    const { code } = await req.json();
    if (typeof code !== "string" || code.trim().length < 8) {
      return new Response(JSON.stringify({ error: "Invalid code" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const normalized = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    const hash = await sha256Hex(normalized);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: rows, error: lookupErr } = await admin
      .from("mfa_recovery_codes")
      .select("id, used_at")
      .eq("user_id", userId)
      .eq("code_hash", hash)
      .limit(1);
    if (lookupErr) throw lookupErr;
    const row = rows?.[0];
    if (!row || row.used_at) {
      return new Response(JSON.stringify({ error: "That code isn't valid." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Mark code used
    await admin.from("mfa_recovery_codes").update({ used_at: new Date().toISOString() }).eq("id", row.id);

    // Remove all TOTP factors so the user can sign in without their authenticator
    const { data: factorList } = await admin.auth.admin.mfa.listFactors({ userId });
    const factors = factorList?.factors ?? [];
    for (const f of factors) {
      try { await admin.auth.admin.mfa.deleteFactor({ userId, id: f.id }); } catch (_) {}
    }

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
