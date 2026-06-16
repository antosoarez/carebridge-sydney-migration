import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";

/**
 * Subscribes to inbound_messages for advocates:
 * - Returns the count of rows with status === "new" (the unread badge).
 * - Shows a toast for newly inserted enquiries with ONLY the sender's name
 *   (no message content, no health information), linking to the inbox.
 *
 * Relies on existing RLS — only advocates can SELECT/receive realtime rows.
 */
export function useInboundEnquiries(enabled: boolean) {
  const [newCount, setNewCount] = useState(0);
  const navigate = useNavigate();
  const seenIds = useRef<Set<string>>(new Set());
  const initialized = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const loadCount = async () => {
      const { count } = await supabase
        .from("inbound_messages")
        .select("id", { count: "exact", head: true })
        .eq("status", "new");
      if (!cancelled) setNewCount(count ?? 0);
    };

    void loadCount();

    const channel = supabase
      .channel("advocate_inbound_enquiries")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "inbound_messages" },
        (payload) => {
          const row = payload.new as { id: string; name?: string | null; status?: string };
          if (seenIds.current.has(row.id)) return;
          seenIds.current.add(row.id);

          // Only toast if it just arrived after we initialised (avoid spam on
          // first connect — though INSERT subs are forward-only anyway).
          if (initialized.current) {
            const senderName = (row.name && row.name.trim()) || "someone new";
            toast({
              title: "New enquiry",
              description: `New enquiry from ${senderName}`,
              onClick: () => navigate(`/advocate/messages?enquiry=${row.id}`),
            } as any);
          }
          void loadCount();
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "inbound_messages" },
        () => { void loadCount(); }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "inbound_messages" },
        () => { void loadCount(); }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") initialized.current = true;
      });

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [enabled, navigate]);

  return { newCount };
}
