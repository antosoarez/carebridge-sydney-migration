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
    const userId = String(body.user_id ?? "").trim();
    if (!userId) return json({ error: "user_id required" }, 400);

    // Verify the target is a client
    const { data: tgtRoles } = await admin
      .from("user_roles").select("role").eq("user_id", userId);
    if (!tgtRoles?.some((r) => r.role === "client")) {
      return json({ error: "Target is not a client" }, 400);
    }
    if (tgtRoles?.some((r) => r.role === "advocate")) {
      return json({ error: "Refusing to delete an advocate account" }, 400);
    }

    // Best-effort: remove the client's storage objects under client-documents/<userId>/
    try {
      const { data: objs } = await admin.storage.from("client-documents").list(userId, { limit: 1000 });
      if (objs && objs.length) {
        await admin.storage
          .from("client-documents")
          .remove(objs.map((o) => `${userId}/${o.name}`));
      }
    } catch { /* ignore storage cleanup errors */ }

    // Cascade delete public rows via SECURITY DEFINER function
    const { error: rpcErr } = await admin.rpc("admin_delete_client", { _user_id: userId });
    if (rpcErr) return json({ error: rpcErr.message }, 400);

    // Finally remove the auth user
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) return json({ error: delErr.message }, 400);

    return json({ ok: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
