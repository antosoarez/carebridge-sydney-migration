import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendViaResend, inviteEmailHtml, inviteEmailText } from "../_shared/send-via-resend.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
    const fullName = String(body.full_name ?? "").trim();
    const phone = String(body.phone ?? "").trim();
    const redirectTo = String(body.redirect_to ?? "");

    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return json({ error: "Valid email is required" }, 400);
    }
    if (email.length > 255 || fullName.length > 120 || phone.length > 32) {
      return json({ error: "Input too long" }, 400);
    }

    // generateLink with type: 'invite' creates the user if they don't exist
    // and returns a single-use, server-side-expiring action link. This is the
    // same Supabase-managed token mechanism as inviteUserByEmail — we just
    // skip Supabase's email send and deliver via Resend ourselves.
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: {
        data: { full_name: fullName, phone },
        redirectTo: redirectTo || undefined,
      },
    });
    if (linkErr) {
      const msg = linkErr.message || "Invite failed";
      const status = /already|registered|exists/i.test(msg) ? 409 : 400;
      return json({ error: msg }, status);
    }
    const actionLink = linkData?.properties?.action_link;
    const newUserId = linkData?.user?.id ?? null;
    if (!actionLink) return json({ error: "Could not generate invite link" }, 500);

    if (newUserId && phone) {
      await admin.from("profiles").update({ phone }).eq("id", newUserId);
    }

    await sendViaResend({
      to: email,
      subject: "Your CareBridge invitation",
      html: inviteEmailHtml(actionLink, fullName || undefined),
      text: inviteEmailText(actionLink, fullName || undefined),
    });

    return json({ ok: true, user_id: newUserId });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
