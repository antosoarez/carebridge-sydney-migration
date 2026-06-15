import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendViaResend, resetEmailHtml, resetEmailText } from "../_shared/send-via-resend.ts";

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
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? "").trim().toLowerCase();
    const redirectTo = String(body.redirect_to ?? "");

    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return json({ error: "Valid email is required" }, 400);
    }
    if (email.length > 255) return json({ error: "Email too long" }, 400);

    // Always respond ok to avoid email enumeration. Only send if user exists.
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: redirectTo || undefined },
    });

    if (!linkErr) {
      const actionLink = linkData?.properties?.action_link;
      const userId = linkData?.user?.id;
      let fullName: string | undefined;
      if (userId) {
        const { data: prof } = await admin
          .from("profiles").select("full_name").eq("id", userId).maybeSingle();
        fullName = prof?.full_name ?? undefined;
      }
      if (actionLink) {
        try {
          await sendViaResend({
            to: email,
            subject: "Reset your CareBridge password",
            html: resetEmailHtml(actionLink, fullName),
            text: resetEmailText(actionLink, fullName),
          });
        } catch (e) {
          console.error("Resend send failed", e);
          // Still return ok to caller (don't leak existence), but log server-side.
        }
      }
    } else {
      console.log("generateLink recovery skipped:", linkErr.message);
    }

    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ ok: true }); // never leak
  }
});
