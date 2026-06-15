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

    // Verify the password was actually changed by inspecting the auth user.
    // Supabase updates auth.users.updated_at whenever the password is changed.
    // If updated_at is essentially equal to created_at, no password update has
    // happened yet — refuse to clear must_change_password.
    const { data: authUser, error: getErr } = await admin.auth.admin.getUserById(userData.user.id);
    if (getErr || !authUser?.user) return json({ error: "Unable to verify account" }, 500);

    const createdAt = new Date(authUser.user.created_at ?? 0).getTime();
    const updatedAt = new Date(authUser.user.updated_at ?? authUser.user.created_at ?? 0).getTime();
    // Require at least 5 seconds of separation to be confident a password
    // update (or other auth mutation) actually occurred after account creation.
    if (!updatedAt || updatedAt - createdAt < 5_000) {
      return json({ error: "Password must be changed before activating" }, 400);
    }

    await admin
      .from("profiles")
      .update({ activated_at: new Date().toISOString(), must_change_password: false })
      .eq("id", userData.user.id);

    return json({ ok: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
