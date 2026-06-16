import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

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
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);
    if (!roles?.some((r) => r.role === "advocate")) {
      return json({ error: "Forbidden — advocate only" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? "").trim().toLowerCase();
    const fullName = String(body.full_name ?? "").trim();
    const method = String(body.method ?? "invite");
    const tempPassword = String(body.temp_password ?? "");
    const redirectTo = String(body.redirect_to ?? "");

    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return json({ error: "Please enter a valid email." }, 400);
    }
    if (email.length > 255 || fullName.length > 120 || fullName.length < 1) {
      return json({ error: "Name and email must be valid lengths." }, 400);
    }
    if (method !== "invite" && method !== "direct") {
      return json({ error: "Invalid method." }, 400);
    }
    if (method === "direct" && tempPassword.length < 8) {
      return json({ error: "Temporary password must be at least 8 characters." }, 400);
    }

    // Duplicate check — paginate through all auth users
    let dup: { id: string; email?: string | null } | null = null;
    for (let page = 1; page <= 20; page++) {
      const { data: existing, error: listErr } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (listErr) break;
      const found = existing?.users?.find((u) => (u.email ?? "").toLowerCase() === email);
      if (found) { dup = found; break; }
      if (!existing?.users || existing.users.length < 200) break;
    }

    if (dup) {
      // If the auth user is orphaned (no profile row or never activated), reuse it instead of failing.
      const { data: existingProfile } = await admin
        .from("profiles")
        .select("id, activated_at")
        .eq("id", dup.id)
        .maybeSingle();

      const isOrphan = !existingProfile || existingProfile.activated_at === null;
      if (!isOrphan) {
        return json({ error: "An account with this email already exists." }, 409);
      }

      // Reuse the orphaned account.
      if (method === "direct") {
        await admin.auth.admin.updateUserById(dup.id, {
          password: tempPassword,
          email_confirm: true,
          user_metadata: { full_name: fullName },
        });
      }
      await admin
        .from("profiles")
        .update({
          full_name: fullName,
          must_change_password: method === "direct",
          activated_at: null,
        })
        .eq("id", dup.id);

      if (method === "invite") {
        // Re-send invite link
        await admin.auth.admin.inviteUserByEmail(email, {
          data: { full_name: fullName },
          redirectTo: redirectTo || undefined,
        }).catch(() => {});
      }

      return json({ ok: true, user_id: dup.id, method, reused: true });
    }

    let newUserId: string | null = null;

    if (method === "invite") {
      const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: fullName },
        redirectTo: redirectTo || undefined,
      });
      if (inviteErr) return json({ error: inviteErr.message || "Invite failed" }, 400);
      newUserId = invited.user?.id ?? null;
    } else {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (createErr) return json({ error: createErr.message || "Create failed" }, 400);
      newUserId = created.user?.id ?? null;
    }

    if (newUserId) {
      // Ensure profile name + flags are correct (handle_new_user trigger creates the row)
      await admin
        .from("profiles")
        .update({
          full_name: fullName,
          must_change_password: method === "direct",
          activated_at: null,
        })
        .eq("id", newUserId);
    }

    return json({ ok: true, user_id: newUserId, method });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
