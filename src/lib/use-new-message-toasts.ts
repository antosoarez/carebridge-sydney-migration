import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useUnreadMessages } from "@/lib/use-unread-messages";
import { playSoftChime } from "@/lib/use-message-chime";


/**
 * MSG-D-1 in-app toast notifications.
 *
 * Listens to the existing unread-counts poll (10s) and fires a calm,
 * ocean-toned toast whenever a thread's unread count grows. Burst-aware:
 * if a thread gains >1 new unread between ticks, it collapses to
 * "{n} new messages from {name}".
 *
 * No chime, auto-dismiss ~5s, tap navigates to /messages.
 * Always fires regardless of email preference / quiet hours.
 */
export function useNewMessageToasts(role: "advocate" | "client") {
  const { byThread } = useUnreadMessages();
  const prevRef = useRef<Map<string, number> | null>(null);
  const navigate = useNavigate();
  const nameCacheRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    const prev = prevRef.current;
    // First tick — establish baseline silently so we don't toast on page load.
    if (prev === null) {
      prevRef.current = new Map(byThread);
      return;
    }

    const newlyGrown: Array<{ threadId: string; delta: number }> = [];
    byThread.forEach((count, threadId) => {
      const before = prev.get(threadId) ?? 0;
      if (count > before) {
        // Skip if user is already viewing this exact thread.
        const path = window.location.pathname;
        const onThisThread =
          (role === "advocate" && path.includes(`/messages/${threadId}`)) ||
          (role === "client" && path.endsWith("/client/messages"));
        if (!onThisThread) {
          newlyGrown.push({ threadId, delta: count - before });
        }
      }
    });

    prevRef.current = new Map(byThread);

    if (newlyGrown.length === 0) return;

    // One soft chime per tick, regardless of how many toasts fire.
    // Suppressed when there are no surviving toasts (e.g. user is on-thread).
    playSoftChime();


    (async () => {
      // Resolve sender names: for client there's only one thread (advocate);
      // for advocate, look up the client profile for each newly-grown thread.
      for (const { threadId, delta } of newlyGrown) {
        let name = nameCacheRef.current.get(threadId);
        if (!name) {
          if (role === "client") {
            const { data } = await supabase.rpc("get_my_advocate").maybeSingle();
            const a = data as { full_name: string | null; email: string | null } | null;
            name = (a?.full_name?.trim() || a?.email || "your advocate") as string;
          } else {
            const { data: t } = await supabase
              .from("message_threads")
              .select("client_id")
              .eq("id", threadId)
              .maybeSingle();
            if (t?.client_id) {
              const { data: p } = await supabase
                .from("profiles")
                .select("full_name, email")
                .eq("id", t.client_id)
                .maybeSingle();
              name =
                (p?.full_name?.trim() || p?.email || "a client") as string;
            } else {
              name = "a client";
            }
          }
          nameCacheRef.current.set(threadId, name);
        }

        const title =
          delta > 1
            ? `${delta} new messages from ${name}`
            : `New message from ${name}`;

        toast(title, {
          duration: 5000,
          className: "rounded-2xl",
          action: {
            label: "Open",
            onClick: () => {
              navigate(
                role === "advocate"
                  ? `/advocate/messages/${threadId}`
                  : "/client/messages"
              );
            },
          },
        });
      }
    })();
  }, [byThread, navigate, role]);
}
