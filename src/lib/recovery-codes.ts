import { supabase } from "@/integrations/supabase/client";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

function randomCode(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return `${s.slice(0, 5)}-${s.slice(5)}`;
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function normalize(code: string) {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export async function generateRecoveryCodes(): Promise<string[]> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) throw new Error("Not signed in");

  // Invalidate previous codes
  await supabase.from("mfa_recovery_codes").delete().eq("user_id", user.id);

  const codes = Array.from({ length: 10 }, () => randomCode());
  const rows = await Promise.all(
    codes.map(async (c) => ({ user_id: user.id, code_hash: await sha256Hex(normalize(c)) })),
  );
  const { error } = await supabase.from("mfa_recovery_codes").insert(rows);
  if (error) throw error;
  return codes;
}

export async function countActiveRecoveryCodes(): Promise<number> {
  const { data, error } = await supabase.rpc("count_my_active_recovery_codes");
  if (error) return 0;
  return (data as number) ?? 0;
}

export async function verifyRecoveryCode(code: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke("mfa-recovery-verify", {
    body: { code: normalize(code) },
  });
  if (error) throw new Error(error.message);
  if (!data?.ok) throw new Error(data?.error || "Invalid recovery code");
}
