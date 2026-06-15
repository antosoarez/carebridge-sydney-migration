import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface SubtaskRow {
  id: string;
  parent_task_id: string;
  title: string;
  done: boolean;
  done_at: string | null;
  sort_order: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

/** Loads sub-tasks for a single parent task and exposes mutators. */
export function useSubtasks(parentTaskId: string) {
  const [subtasks, setSubtasks] = useState<SubtaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!parentTaskId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("task_subtasks")
        .select("*")
        .eq("parent_task_id", parentTaskId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (cancelled) return;
      if (error) {
        console.error("Failed to load subtasks", error);
        setSubtasks([]);
      } else {
        setSubtasks((data ?? []) as SubtaskRow[]);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [parentTaskId, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  /** If every sub-task is done (and there's at least one), mark the parent complete. */
  const maybeCompleteParent = useCallback(async () => {
    const { data, error } = await supabase
      .from("task_subtasks")
      .select("done")
      .eq("parent_task_id", parentTaskId);
    if (error || !data || data.length === 0) return;
    const allDone = data.every((s) => s.done);
    if (allDone) {
      await supabase
        .from("tasks")
        .update({ status: "complete", completed_at: new Date().toISOString() })
        .eq("id", parentTaskId)
        .eq("status", "to_do");
    }
  }, [parentTaskId]);

  const add = useCallback(async (title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes.user?.id;
    if (!uid) throw new Error("Not signed in");
    const nextOrder = subtasks.length > 0 ? Math.max(...subtasks.map((s) => s.sort_order)) + 1 : 0;
    const { error } = await supabase.from("task_subtasks").insert({
      parent_task_id: parentTaskId,
      title: trimmed,
      sort_order: nextOrder,
      created_by: uid,
    });
    if (error) throw error;
    reload();
  }, [parentTaskId, subtasks, reload]);

  const updateTitle = useCallback(async (id: string, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const { error } = await supabase.from("task_subtasks").update({ title: trimmed }).eq("id", id);
    if (error) throw error;
    reload();
  }, [reload]);

  const toggle = useCallback(async (s: SubtaskRow) => {
    const next = !s.done;
    const { error } = await supabase
      .from("task_subtasks")
      .update({ done: next, done_at: next ? new Date().toISOString() : null })
      .eq("id", s.id);
    if (error) throw error;
    if (next) await maybeCompleteParent();
    reload();
  }, [reload, maybeCompleteParent]);

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase.from("task_subtasks").delete().eq("id", id);
    if (error) throw error;
    reload();
  }, [reload]);

  const markAllDone = useCallback(async () => {
    const open = subtasks.filter((s) => !s.done);
    if (open.length === 0) return;
    const nowIso = new Date().toISOString();
    // Sequential for cascade animation feel + RLS clarity.
    for (const s of open) {
      await supabase
        .from("task_subtasks")
        .update({ done: true, done_at: nowIso })
        .eq("id", s.id);
      // small pause for the calm cascade
      await new Promise((r) => setTimeout(r, 120));
    }
    await maybeCompleteParent();
    reload();
  }, [subtasks, reload, maybeCompleteParent]);

  const applyTemplate = useCallback(async (items: string[]) => {
    if (items.length === 0) return;
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes.user?.id;
    if (!uid) throw new Error("Not signed in");
    const startOrder = subtasks.length > 0 ? Math.max(...subtasks.map((s) => s.sort_order)) + 1 : 0;
    const rows = items.map((title, i) => ({
      parent_task_id: parentTaskId,
      title,
      sort_order: startOrder + i,
      created_by: uid,
    }));
    const { error } = await supabase.from("task_subtasks").insert(rows);
    if (error) throw error;
    reload();
  }, [parentTaskId, subtasks, reload]);

  return { subtasks, loading, reload, add, updateTitle, toggle, remove, markAllDone, applyTemplate };
}
