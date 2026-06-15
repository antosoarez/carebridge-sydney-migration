// Cancels a pending email-change request. Allowed for the user themselves or
// for any advocate. JWT-verified.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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
    if (!authHeader) return json({ error: "Please sign in again." }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ error: "Please sign in again." }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json().catch(() => ({}));
    const requestId = String(body.request_id ?? "").trim();
    if (!requestId) return json({ error: "Missing request." }, 400);

    const { data: row } = await admin
      .from("email_change_requests")
      .select("id, user_id, status")
      .eq("id", requestId)
      .maybeSingle();
    if (!row) return json({ error: "Not found." }, 404);
    if (row.status !== "pending") return json({ error: "This request isn't pending." }, 400);

    const { data: roles } = await admin
      .from("user_roles").select("role").eq("user_id", u.user.id);
    const isAdvocate = !!roles?.some((r) => r.role === "advocate");
    if (u.user.id !== row.user_id && !isAdvocate) {
      return json({ error: "Not allowed." }, 403);
    }

    await admin
      .from("email_change_requests")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", requestId);

    return json({ ok: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
