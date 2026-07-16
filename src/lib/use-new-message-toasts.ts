import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useUnreadMessages } from "@/lib/use-unread-messages";
import { playSoftChime } from "@/lib/use-message-chime";

// Variable global para evitar que se muestren múltiples toasts para el mismo hilo en un corto período de tiempo
const globalSeenCounts = new Map<string, number>();

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
  const navigate = useNavigate();
  const nameCacheRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    const newlyGrown: Array<{ threadId: string; delta: number }> = [];
    
    byThread.forEach((count, threadId) => {
      // Si el hilo no existe en la memoria, asume el conteo actual como "ya visto" (baseline silencioso).
      // Esto evita que lance notificaciones la primera vez que carga la página.
      const before = globalSeenCounts.get(threadId) ?? count;

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
      // Actualizamos la memoria global para la próxima validación
      globalSeenCounts.set(threadId, count);
    });

    if (newlyGrown.length === 0) return;

    // One soft chime per tick, regardless of how many toasts fire.
    playSoftChime();


    (async () => {
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
              name = (p?.full_name?.trim() || p?.email || "a client") as string;
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
