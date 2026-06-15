import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** The engagement bar is now fully recomputed server-side from current data
 *  (attended/cancelled appointments, uploaded documents, completed tasks).
 *  This hook just listens to profiles.client_progress. */
export function useOwnClientProgress(userId?: string): { value: number; loading: boolean } {
  const [value, setValue] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const fetchVal = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("client_progress")
        .eq("id", userId)
        .maybeSingle();
      if (cancelled) return;
      setValue(Math.max(0, Math.min(100, Number(data?.client_progress ?? 0))));
      setLoading(false);
    };

    fetchVal();

    const channel = supabase
      .channel(`profile-progress-${userId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${userId}` },
        (payload) => {
          const next = (payload.new as { client_progress?: number })?.client_progress;
          if (typeof next === "number") setValue(Math.max(0, Math.min(100, next)));
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return { value, loading };
}

/** Kept as no-ops for compatibility — the bar recomputes automatically when
 *  the underlying appointment / task / document data changes. */
export async function creditFollowUpResponse(_userId: string) {}
export async function creditMissedAppointment(_userId: string) {}
export async function creditAttendedAppointment(_userId: string) {}
