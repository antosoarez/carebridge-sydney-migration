import { createContext, useContext, useCallback, useEffect, useRef, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

// 1. Definimos la forma de nuestro contexto
interface UnreadContextValue {
  total: number;
  byThread: Map<string, number>;
  refresh: () => Promise<void>;
}

// 2. Creamos el contexto con valores por defecto
const UnreadContext = createContext<UnreadContextValue>({
  total: 0,
  byThread: new Map(),
  refresh: async () => {},
});

type UnreadMessageCountRow = {
  thread_id: string;
  unread_count: number;
};

/**
 * MSG-C unread counts (Supabase-backed).
 * Returns { total, byThread } where:
 *   - total: count of messages where read_at IS NULL and sender_id <> me
 *           (RLS naturally scopes a client to their own thread; an advocate sees all)
 *   - byThread: Map<thread_id, count> for advocate inbox row indicators
 *
 * Re-polls every 10s, and exposes a `refresh()` to call after marking-as-read.
 */
export function UnreadMessagesProvider({ children }: { children: ReactNode }) {
  const [total, setTotal] = useState(0);
  const [byThread, setByThread] = useState<Map<string, number>>(new Map());
  const meRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!meRef.current) {
      const { data } = await supabase.auth.getUser();
      meRef.current = data.user?.id ?? null;
    }
    const me = meRef.current;
    if (!me) {
      setTotal(0);
      setByThread(new Map());
      return;
    }

    const { data, error } = await supabase.rpc("get_unread_message_counts");

    if (error) return;

    const rows = Array.isArray(data)
      ? (data as UnreadMessageCountRow[])
      : [];

    const map = new Map<string, number>();
    let totalUnread = 0;

    rows.forEach((row) => {
      const count = Number(row.unread_count ?? 0);
      map.set(row.thread_id, count);
      totalUnread += count;
    });

    setByThread(map);
    setTotal(totalUnread);
    
  }, []);

  useEffect(() => {
    // 1. Carga inicial
    refresh();

    // Creamos un ID dinámico y único para que Supabase no mezcle canales en memoria
    const channelId = `unread-messages-${Date.now()}`;

    // 2. Suscripción a WebSockets (Realtime) usando el ID único
    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'messages' 
        },
        () => {
          refresh();
        }
      )
      .subscribe();

    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    window.addEventListener("oceanpath:messages-read", onFocus);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("oceanpath:messages-read", onFocus);
    };
  }, [refresh]);
  
  return (
    <UnreadContext.Provider value={{ total, byThread, refresh }}>
      {children}
    </UnreadContext.Provider>
  );
}

// 4. El Hook: Ahora solo consume el contexto, ya NO crea WebSockets
export function useUnreadMessages() {
  return useContext(UnreadContext);
}

/** Fire-and-forget: mark all other-party messages in a thread as read. */
export async function markThreadRead(threadId: string) {
  const { error } = await supabase.rpc("mark_thread_read", { _thread_id: threadId });
  if (!error) {
    window.dispatchEvent(new CustomEvent("oceanpath:messages-read"));
  }
}
