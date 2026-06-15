import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const POLL_MS = 10_000;

/**
 * MSG-C unread counts (Supabase-backed).
 * Returns { total, byThread } where:
 *   - total: count of messages where read_at IS NULL and sender_id <> me
 *           (RLS naturally scopes a client to their own thread; an advocate sees all)
 *   - byThread: Map<thread_id, count> for advocate inbox row indicators
 *
 * Re-polls every 10s, and exposes a `refresh()` to call after marking-as-read.
 */
export function useUnreadMessages() {
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
    // Pull only what RLS allows; small payload (thread_id only).
    const { data, error } = await supabase
      .from("messages")
      .select("thread_id, sender_id")
      .is("read_at", null)
      .neq("sender_id", me);
    if (error) return;
    const map = new Map<string, number>();
    (data ?? []).forEach((m: any) => {
      map.set(m.thread_id, (map.get(m.thread_id) ?? 0) + 1);
    });
    setByThread(map);
    setTotal((data ?? []).length);
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, POLL_MS);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    window.addEventListener("oceanpath:messages-read", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("oceanpath:messages-read", onFocus);
    };
  }, [refresh]);

  return { total, byThread, refresh };
}

/** Fire-and-forget: mark all other-party messages in a thread as read. */
export async function markThreadRead(threadId: string) {
  const { error } = await supabase.rpc("mark_thread_read", { _thread_id: threadId });
  if (!error) {
    window.dispatchEvent(new CustomEvent("oceanpath:messages-read"));
  }
}
