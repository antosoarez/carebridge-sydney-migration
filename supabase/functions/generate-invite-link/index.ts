import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { findAuthUserByEmail } from "../_shared/find-user.ts";

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
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return json({ error: "Valid email required" }, 400);
    }

    // Find user (paginated — works regardless of how many auth users exist)
    const u = await findAuthUserByEmail(admin, email);
    if (!u) return json({ error: "No pending client found for that email." }, 404);

    // Refuse if already activated
    const { data: prof } = await admin
      .from("profiles").select("activated_at").eq("id", u.id).maybeSingle();
    if (prof?.activated_at) {
      return json({ error: "This client has already activated their account." }, 409);
    }

    // Invalidate any previously-issued, still-unexpired invite/magic/recovery
    // token for this user before minting a fresh one. A leaked older link
    // must stop working the moment a new one is generated.
    await admin.rpc("invalidate_user_auth_tokens", { _user_id: u.id });

    // Generate a fresh single-use link. Use 'invite' for never-confirmed users
    // (creates a longer-lived invite token); fall back to 'magiclink' otherwise.
    const linkType: "invite" | "magiclink" = u.email_confirmed_at ? "magiclink" : "invite";
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: linkType,
      email,
      options: { redirectTo: redirectTo || undefined },
    });
    if (linkErr) return json({ error: linkErr.message }, 400);

    const actionLink = linkData?.properties?.action_link;
    if (!actionLink) return json({ error: "Could not generate link" }, 500);

    return json({ ok: true, action_link: actionLink, link_type: linkType });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
