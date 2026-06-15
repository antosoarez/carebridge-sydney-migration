import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppointmentItem } from "@/lib/types";

export function useAppointments(clientId?: string): { appointments: AppointmentItem[]; loading: boolean } {
  const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let q = supabase.from("appointments").select("id, client_id, title, starts_at, location").order("starts_at", { ascending: true });
      if (clientId) q = q.eq("client_id", clientId);
      const { data } = await q;
      if (cancelled) return;
      setAppointments((data ?? []).map((a) => ({
        id: a.id,
        clientId: a.client_id,
        title: a.title,
        date: a.starts_at,
        location: a.location ?? "",
      })));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  return { appointments, loading };
}
