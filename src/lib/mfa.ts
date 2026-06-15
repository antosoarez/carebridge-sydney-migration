import { supabase } from "@/integrations/supabase/client";

export async function hasVerifiedTotp(): Promise<boolean> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) return false;
  return (data?.totp ?? []).some((f) => f.status === "verified");
}

export async function needsMfaChallenge(): Promise<boolean> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return false;
  return data.nextLevel === "aal2" && data.currentLevel !== "aal2";
}
