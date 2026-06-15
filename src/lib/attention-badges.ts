import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const VIEW_KEYS = {
  calendar: (uid: string) => `cb.viewed.calendar.${uid}`,
  todo: (uid: string) => `cb.viewed.todo.${uid}`,
} as const;

export function markSectionViewed(section: "calendar" | "todo") {
  supabase.auth.getUser().then(({ data }) => {
    const uid = data.user?.id;
    if (!uid) return;
    localStorage.setItem(VIEW_KEYS[section](uid), new Date().toISOString());
    window.dispatchEvent(new CustomEvent("cb:viewed"));
  });
}

/**
 * Returns gentle attention flags for sidebar dots:
 *  - calendar: any scheduled appointment within the next 24h that arrived
 *    after the user last viewed the calendar.
 *  - todo: any task not yet complete created after the user last viewed
 *    the to-do list.
 *
 * Clears when the user navigates to that section (see markSectionViewed).
 */
export function useAttentionBadges(role: "advocate" | "client") {
  const [calendar, setCalendar] = useState(false);
  const [todo, setTodo] = useState(false);

  const refresh = useCallback(async () => {
    const { data: au } = await supabase.auth.getUser();
    const uid = au.user?.id;
    if (!uid) return;
    const lastCal = localStorage.getItem(VIEW_KEYS.calendar(uid));
    const lastTodo = localStorage.getItem(VIEW_KEYS.todo(uid));
    const nowISO = new Date().toISOString();
    const in24 = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

    let aq = supabase
      .from("appointments")
      .select("id, created_at, starts_at, client_id")
      .gte("starts_at", nowISO)
      .lte("starts_at", in24)
      .eq("outcome", "scheduled");
    if (role === "client") aq = aq.eq("client_id", uid);
    const { data: appts } = await aq;
    const calHit =
      (appts ?? []).length > 0 &&
      (!lastCal || (appts ?? []).some((a) => new Date(a.created_at) > new Date(lastCal)));
    setCalendar(calHit);

    let tq = supabase.from("tasks").select("id, created_at, client_id").neq("status", "complete");
    if (role === "client") tq = tq.eq("client_id", uid);
    const { data: tasks } = await tq;
    const todoHit =
      (tasks ?? []).length > 0 &&
      (!lastTodo || (tasks ?? []).some((t) => new Date(t.created_at) > new Date(lastTodo)));
    setTodo(todoHit);
  }, [role]);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 60_000);
    const onView = () => refresh();
    window.addEventListener("cb:viewed", onView);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("cb:viewed", onView);
    };
  }, [refresh]);

  return { calendar, todo };
}
