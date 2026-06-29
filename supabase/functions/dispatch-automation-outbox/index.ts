// Drains public.automation_outbox and delivers each notification via Resend
// (email) and in-app rows. Invoked on a schedule (pg_cron) and protected by a
// shared token header (x-dispatch-token == OUTBOX_DISPATCH_TOKEN), so it does
// not depend on JWT/gateway behaviour. NO PHI is sent — templates are
// client-safe ("log in to view").
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendViaResend } from "../_shared/send-via-resend.ts";
import { insertInAppNotification } from "../_shared/inapp-notify.ts";
import { renderNotification } from "../_shared/automation-emails.ts";

const BATCH = 50;
const MAX_ATTEMPTS = 5;

function firstName(p: { preferred_name?: string | null; full_name?: string | null } | null): string | null {
  if (!p) return null;
  if (p.preferred_name && p.preferred_name.trim()) return p.preferred_name.trim();
  if (p.full_name && p.full_name.trim()) return p.full_name.trim().split(/\s+/)[0];
  return null;
}

Deno.serve(async (req) => {
  // Shared-token auth (function is deployed with --no-verify-jwt).
  const expected = Deno.env.get("OUTBOX_DISPATCH_TOKEN");
  const provided = req.headers.get("x-dispatch-token");
  if (!expected || provided !== expected) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: rows, error } = await supabase
    .from("automation_outbox")
    .select("*")
    .eq("status", "pending")
    .lt("attempts", MAX_ATTEMPTS)
    .lte("not_before", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(BATCH);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }

  let sent = 0, failed = 0;
  for (const row of rows ?? []) {
    try {
      // Recipient (for greeting + email address) and subject client (advocate-facing name).
      const { data: recipient } = await supabase
        .from("profiles").select("email, full_name, preferred_name")
        .eq("id", row.to_user_id).maybeSingle();
      let clientName: string | null = null;
      if (row.client_id && row.client_id !== row.to_user_id) {
        const { data: subj } = await supabase
          .from("profiles").select("full_name, preferred_name")
          .eq("id", row.client_id).maybeSingle();
        clientName = firstName(subj);
      }

      const rendered = renderNotification(row.template, {
        recipientName: firstName(recipient),
        clientName,
        vars: row.vars ?? {},
      });
      if (!rendered) throw new Error(`unknown template: ${row.template}`);

      const channels: string[] = row.channels ?? ["email", "inapp"];

      // Email (skip if recipient suppressed/unsubscribed).
      if (channels.includes("email") && recipient?.email) {
        const { data: suppressed } = await supabase
          .from("suppressed_emails").select("email").eq("email", recipient.email).maybeSingle();
        if (!suppressed) {
          await sendViaResend({
            to: recipient.email,
            subject: rendered.subject,
            html: rendered.html,
            text: rendered.text,
          });
        }
      }

      // In-app (helper respects the user's inapp_enabled toggle).
      if (channels.includes("inapp")) {
        await insertInAppNotification(supabase, {
          user_id: row.to_user_id,
          user_role: row.to_role,
          kind: rendered.inappKind,
          title: rendered.inappTitle,
          body: rendered.inappBody,
          link: rendered.link,
        });
      }

      await supabase.from("automation_outbox")
        .update({ status: "sent", sent_at: new Date().toISOString(), attempts: (row.attempts ?? 0) + 1 })
        .eq("id", row.id);
      sent++;
    } catch (e) {
      failed++;
      const attempts = (row.attempts ?? 0) + 1;
      await supabase.from("automation_outbox")
        .update({
          attempts,
          last_error: e instanceof Error ? e.message : String(e),
          status: attempts >= MAX_ATTEMPTS ? "error" : "pending",
        })
        .eq("id", row.id);
    }
  }

  return new Response(JSON.stringify({ ok: true, sent, failed, scanned: rows?.length ?? 0 }), {
    headers: { "Content-Type": "application/json" },
  });
});
