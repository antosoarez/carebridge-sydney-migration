import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export type AppNotification = {
  id: string;
  user_id: string;
  user_role: "client" | "advocate";
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  metadata: Record<string, unknown> | null;
  read_at: string | null;
  dismissed_at: string | null;
  created_at: string;
};

const PAGE_SIZE = 30;

export function useNotifications() {
  const { user } = useAuth();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setItems([]);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .is("dismissed_at", null)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);
    setItems((data ?? []) as AppNotification[]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel(`notifications-${user.id}-${Math.random().toString(36).slice(2)}`);
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${user.id}`,
      },
      () => {
        void load();
      }
    );
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, load]);


  const unread = useMemo(
    () => items.filter((n) => !n.read_at && !n.dismissed_at).length,
    [items]
  );

  const markRead = useCallback(async (id: string) => {
    setItems((prev) =>
      prev.map((n) => (n.id === id && !n.read_at ? { ...n, read_at: new Date().toISOString() } : n))
    );
    await supabase.rpc("mark_notification_read", { _id: id });
  }, []);

  const markAllRead = useCallback(async () => {
    const stamp = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: stamp })));
    await supabase.rpc("mark_all_notifications_read");
  }, []);

  const dismiss = useCallback(async (id: string) => {
    setItems((prev) => prev.filter((n) => n.id !== id));
    await supabase.from("notifications").delete().eq("id", id);
  }, []);

  return { items, unread, loading, markRead, markAllRead, dismiss, reload: load };
}
