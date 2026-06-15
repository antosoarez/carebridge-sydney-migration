// Shared helpers for edge functions that need to look up an auth user by email
// without hitting the 200-user ceiling of a single listUsers() call.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const PAGE_SIZE = 200;
const MAX_PAGES = 50; // safety cap → up to 10,000 users

export async function findAuthUserByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<{ id: string; email: string | null; email_confirmed_at: string | null } | null> {
  const needle = email.trim().toLowerCase();
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
    if (error) throw error;
    const users = data?.users ?? [];
    const hit = users.find((u) => (u.email ?? "").toLowerCase() === needle);
    if (hit) {
      return {
        id: hit.id,
        email: hit.email ?? null,
        email_confirmed_at: hit.email_confirmed_at ?? null,
      };
    }
    if (users.length < PAGE_SIZE) return null;
  }
  return null;
}
