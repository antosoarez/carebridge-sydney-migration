import { supabase } from "@/integrations/supabase/client";

export type UrgencyLevel = "Critical" | "High" | "Medium" | "Low" | "Stable";

export interface UrgencySignal {
  label: string;
  points: number;
}

export interface UrgencyResult {
  score: number;
  level: UrgencyLevel;
  signals: UrgencySignal[];
}

export async function calculateUrgency(clientId: string): Promise<UrgencyResult | null> {
  const { data, error } = await (supabase as any).rpc("calculate_client_urgency", {
    p_client_id: clientId,
  });
  if (error || !data || !data.length) return null;
  const row = data[0];
  return {
    score: row.score ?? 0,
    level: (row.level as UrgencyLevel) ?? "Stable",
    signals: Array.isArray(row.signals) ? (row.signals as UrgencySignal[]) : [],
  };
}

export function urgencyBadgeClasses(level: UrgencyLevel): string {
  switch (level) {
    case "Critical":
      return "bg-destructive/15 text-destructive border-destructive/30";
    case "High":
      return "bg-amber-500/15 text-amber-700 border-amber-500/30";
    case "Medium":
      return "bg-status-pending text-status-pending-fg border-transparent";
    case "Low":
      return "bg-primary/10 text-primary border-primary/20";
    default:
      return "bg-muted text-muted-foreground border-transparent";
  }
}

export function topSignal(signals: UrgencySignal[]): UrgencySignal | null {
  if (!signals.length) return null;
  return [...signals].sort((a, b) => b.points - a.points)[0];
}
