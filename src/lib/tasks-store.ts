import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type TaskStatus = "to_do" | "complete";

export interface TaskRow {
  id: string;
  client_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  created_by: string;
  created_at: string;
  completed_at: string | null;
  due_date: string | null;
  due_time: string | null;
  time_block_end: string | null;
  reminder_at: string | null;
  reminder_sent_at: string | null;
  is_priority: boolean;
  auto_dedup_key: string | null;
}

export interface TaskInput {
  client_id: string;
  title: string;
  description?: string | null;
  due_date?: string | null;
  due_time?: string | null;
  time_block_end?: string | null;
  reminder_at?: string | null;
  is_priority?: boolean;
}

export interface TaskPatch {
  title?: string;
  description?: string | null;
  due_date?: string | null;
  due_time?: string | null;
  time_block_end?: string | null;
  reminder_at?: string | null;
  reminder_sent_at?: string | null;
  is_priority?: boolean;
}

export function useTasks(clientId?: string) {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      let q = supabase.from("tasks").select("*").order("created_at", { ascending: false });
      if (clientId) q = q.eq("client_id", clientId);
      const { data, error } = await q;
      if (cancelled) return;
      if (error) {
        console.error("Failed to load tasks", error);
        setTasks([]);
      } else {
        setTasks((data ?? []) as TaskRow[]);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [clientId, nonce]);

  // Realtime: refresh whenever tasks change for this client (or any, when no filter)
  useEffect(() => {
    const uniqueId = `${clientId ?? "all"}-${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(`tasks-rt-${uniqueId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks",
          ...(clientId ? { filter: `client_id=eq.${clientId}` } : {}) },
        () => setNonce((n) => n + 1),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [clientId]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const create = useCallback(async (input: TaskInput) => {
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes.user?.id;
    if (!uid) throw new Error("Not signed in");
    const { error } = await supabase.from("tasks").insert({
      client_id: input.client_id,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      status: "to_do",
      created_by: uid,
      due_date: input.due_date || null,
      due_time: input.due_time || null,
      time_block_end: input.time_block_end || null,
      reminder_at: input.reminder_at || null,
      is_priority: input.is_priority ?? false,
    });
    if (error) throw error;
    reload();
  }, [reload]);

  const update = useCallback(async (id: string, patch: TaskPatch) => {
    const { error } = await supabase.from("tasks").update(patch).eq("id", id);
    if (error) throw error;
    reload();
  }, [reload]);

  const toggle = useCallback(async (t: TaskRow) => {
    const next: TaskStatus = t.status === "to_do" ? "complete" : "to_do";
    const { error } = await supabase
      .from("tasks")
      .update({ status: next, completed_at: next === "complete" ? new Date().toISOString() : null })
      .eq("id", t.id);
    if (error) throw error;
    reload();
  }, [reload]);

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) throw error;
    reload();
  }, [reload]);

  return { tasks, loading, reload, create, update, toggle, remove };
}
