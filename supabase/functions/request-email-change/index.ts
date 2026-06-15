// Starts an email-change request. Either the client themselves (with their
// current password) or an advocate (for typo fixes) can initiate. We store a
// pending row with a hashed 24h token, then send a confirmation email to the
// NEW address and a heads-up to the OLD address. Login does not change until
// the verification link is opened.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendViaResend } from "../_shared/send-via-resend.ts";
import {
  emailChangeNoticeHtml,
  emailChangeNoticeText,
  maskEmail,
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

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
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Please sign in again." }, 401);
    const caller = userData.user;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = await req.json().catch(() => ({}));
    const targetUserId = String(body.user_id ?? "").trim();
    const newEmailRaw = String(body.new_email ?? "").trim().toLowerCase();
    const currentPassword = typeof body.current_password === "string" ? body.current_password : null;

    if (!targetUserId) return json({ error: "Missing client." }, 400);
    if (!newEmailRaw || !EMAIL_RE.test(newEmailRaw) || newEmailRaw.length > 254) {
      return json({ error: "That email doesn't look quite right — please double-check it." }, 400);
    }

    // Caller roles
    const { data: callerRoles } = await admin
      .from("user_roles").select("role").eq("user_id", caller.id);
    const callerIsAdvocate = !!callerRoles?.some((r) => r.role === "advocate");

    // Determine initiator role + permission
    let initiatorRole: "advocate" | "client";
    if (caller.id === targetUserId) {
      initiatorRole = "client";
      if (!currentPassword) {
        return json({ error: "Please enter your current password to authorise the change." }, 400);
      }
      // Re-verify password
      const oneShot = createClient(SUPABASE_URL, ANON_KEY);
      const { error: pwErr } = await oneShot.auth.signInWithPassword({
        email: caller.email ?? "",
        password: currentPassword,
      });
      if (pwErr) {
        return json({ error: "That password didn't match — please try again." }, 400);
      }
    } else {
      if (!callerIsAdvocate) return json({ error: "Only advocates can change another account's email." }, 403);
      initiatorRole = "advocate";
      // Target must be a client, not another advocate/admin
      const { data: tgtRoles } = await admin
        .from("user_roles").select("role").eq("user_id", targetUserId);
      if (!tgtRoles?.some((r) => r.role === "client")) {
        return json({ error: "This account isn't a client account." }, 400);
      }
      if (tgtRoles?.some((r) => r.role === "advocate")) {
        return json({ error: "Advocate accounts can't be edited from here." }, 403);
      }
    }

    // Load target profile / current email
    const { data: targetUser, error: targetErr } = await admin.auth.admin.getUserById(targetUserId);
    if (targetErr || !targetUser?.user) return json({ error: "We couldn't find that account." }, 404);
    const oldEmail = (targetUser.user.email ?? "").toLowerCase();

    if (newEmailRaw === oldEmail) {
      return json({ error: "That's already the current email on the account." }, 400);
    }

    // Already in use by another account?
    // List users filtered by email (admin API supports pagination — we use a small page)
    const { data: existingByEmail } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const conflict = existingByEmail?.users?.find(
      (u) => u.email && u.email.toLowerCase() === newEmailRaw && u.id !== targetUserId,
    );
    if (conflict) {
      return json({ error: "Another account is already using that email." }, 409);
    }

    // Cancel any older pending row for this user so the partial-unique index lets us insert
    await admin
      .from("email_change_requests")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("user_id", targetUserId)
      .eq("status", "pending");

    const rawToken = randomToken();
    const tokenHash = await sha256Hex(rawToken);

    const { data: inserted, error: insErr } = await admin
      .from("email_change_requests")
      .insert({
        user_id: targetUserId,
        old_email: oldEmail,
        new_email: newEmailRaw,
        initiated_by: caller.id,
        initiator_role: initiatorRole,
        token_hash: tokenHash,
      })
      .select("id, new_email")
      .single();
    if (insErr || !inserted) return json({ error: insErr?.message ?? "Couldn't save the request." }, 500);

    const fullName = (targetUser.user.user_metadata?.full_name as string | undefined) ?? undefined;
    const verifyLink = `${SITE_URL.replace(/\/$/, "")}/verify-email-change?token=${rawToken}`;

    // Fire-and-await both emails; if either fails, surface the error but the
    // request row still exists so we can resend later.
    try {
      await sendViaResend({
        to: newEmailRaw,
        subject: "Please confirm your new CareBridge email",
        html: verifyEmailChangeHtml(verifyLink, newEmailRaw, fullName),
        text: verifyEmailChangeText(verifyLink, newEmailRaw, fullName),
      });
    } catch (e) {
      return json({ error: "We couldn't send the confirmation email — please try again in a moment.", detail: String(e) }, 502);
    }

    if (oldEmail) {
      try {
        await sendViaResend({
          to: oldEmail,
          subject: "Heads-up: a change to your CareBridge email was requested",
          html: emailChangeNoticeHtml(maskEmail(newEmailRaw), fullName),
          text: emailChangeNoticeText(maskEmail(newEmailRaw), fullName),
        });
      } catch { /* don't block the flow on the heads-up email */ }
    }

    return json({ ok: true, request_id: inserted.id, pending_to: newEmailRaw });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
