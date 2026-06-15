import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { findAuthUserByEmail } from "../_shared/find-user.ts";
import { sendViaResend, inviteEmailHtml, inviteEmailText } from "../_shared/send-via-resend.ts";

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

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roles } = await admin
      .from("user_roles").select("role").eq("user_id", userData.user.id);
    if (!roles?.some((r) => r.role === "advocate")) {
      return json({ error: "Forbidden — advocate only" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? "").trim().toLowerCase();
    const redirectTo = String(body.redirect_to ?? "");
    if (!email) return json({ error: "Email required" }, 400);

    const u = await findAuthUserByEmail(admin, email);
    if (!u) return json({ error: "No account found for that email." }, 404);

    const { data: prof } = await admin
      .from("profiles").select("activated_at, full_name").eq("id", u.id).maybeSingle();
    if (prof?.activated_at) {
      return json({ error: "This client has already activated their account." }, 409);
    }

    // Revoke any previously-issued, still-unexpired token for this user.
    await admin.rpc("invalidate_user_auth_tokens", { _user_id: u.id });

    // Mint a fresh single-use Supabase token. Token security/expiry are
    // managed by Supabase exactly as before — we only change the delivery.
    const linkType: "invite" | "magiclink" = u.email_confirmed_at ? "magiclink" : "invite";
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: linkType,
      email,
      options: { redirectTo: redirectTo || undefined },
    });
    if (linkErr) return json({ error: linkErr.message }, 400);
    const actionLink = linkData?.properties?.action_link;
    if (!actionLink) return json({ error: "Could not generate link" }, 500);

    // Deliver via Resend (not via Supabase auth email hook / Lovable queue).
    await sendViaResend({
      to: email,
      subject: "Your CareBridge invitation",
      html: inviteEmailHtml(actionLink, prof?.full_name ?? undefined),
      text: inviteEmailText(actionLink, prof?.full_name ?? undefined),
    });

    return json({ ok: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
