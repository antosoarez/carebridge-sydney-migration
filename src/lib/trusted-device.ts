import { supabase } from "@/integrations/supabase/client";

const STORAGE_PREFIX = "cb_trusted_device:";
const TRUST_DAYS = 30;

async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}${userId}`;
}

function deviceLabel(): string {
  const ua = navigator.userAgent;
  let platform = "Device";
  if (/iPhone|iPad|iPod/i.test(ua)) platform = "iOS";
  else if (/Android/i.test(ua)) platform = "Android";
  else if (/Mac/i.test(ua)) platform = "Mac";
  else if (/Windows/i.test(ua)) platform = "Windows";
  let browser = "Browser";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/Chrome\//i.test(ua)) browser = "Chrome";
  else if (/Safari\//i.test(ua)) browser = "Safari";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  return `${platform} · ${browser}`;
}

/** Register the current device as trusted (call after MFA challenge passes). */
export async function trustCurrentDevice(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  // Generate a high-entropy token
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const token = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  const hash = await sha256(token);
  const expiresAt = new Date(Date.now() + TRUST_DAYS * 24 * 60 * 60 * 1000);

  const { error } = await supabase.from("trusted_devices").upsert(
    {
      user_id: user.id,
      token_hash: hash,
      label: deviceLabel(),
      expires_at: expiresAt.toISOString(),
      last_used_at: new Date().toISOString(),
    },
    { onConflict: "user_id,token_hash" }
  );
  if (error) throw error;

  localStorage.setItem(storageKey(user.id), token);
}

/** Returns true if this device currently has a valid trusted token for the signed-in user. */
export async function isCurrentDeviceTrusted(): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const token = localStorage.getItem(storageKey(user.id));
  if (!token) return false;
  const hash = await sha256(token);
  const { data, error } = await supabase
    .rpc("find_my_trusted_device", { _token_hash: hash });
  const row = Array.isArray(data) ? data[0] : null;
  if (error || !row) return false;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await supabase.from("trusted_devices").delete().eq("id", row.id);
    localStorage.removeItem(storageKey(user.id));
    return false;
  }
  // Refresh last_used_at (best effort)
  supabase.from("trusted_devices").update({ last_used_at: new Date().toISOString() }).eq("id", row.id).then(() => {});
  return true;
}

/** Forget this device. */
export async function untrustCurrentDevice(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const token = localStorage.getItem(storageKey(user.id));
  localStorage.removeItem(storageKey(user.id));
  if (!token) return;
  const hash = await sha256(token);
  await supabase.from("trusted_devices").delete().eq("user_id", user.id).eq("token_hash", hash);
}

/** Revoke ALL trusted devices for the current user. */
export async function untrustAllDevices(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  localStorage.removeItem(storageKey(user.id));
  await supabase.from("trusted_devices").delete().eq("user_id", user.id);
}

export async function listTrustedDevices() {
  const { data, error } = await supabase.rpc("list_my_trusted_devices");
  if (error) throw error;
  return data ?? [];
}

export async function revokeTrustedDevice(id: string): Promise<void> {
  await supabase.from("trusted_devices").delete().eq("id", id);
}

export const TRUST_DURATION_DAYS = TRUST_DAYS;
