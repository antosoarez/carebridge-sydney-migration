import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const sb = supabase as unknown as { from: (t: string) => any };

export type AutomationRule = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  trigger_kind: string;
  trigger_config: Record<string, unknown>;
  enabled: boolean;
  priority: number;
};

export type AutomationAction = {
  id: string;
  rule_id: string;
  action_kind: string;
  action_config: Record<string, unknown>;
  sort_order: number;
};

export function useAutomationRules() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [actions, setActions] = useState<AutomationAction[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const [r, a] = await Promise.all([
      sb.from("automation_rules").select("*").order("priority", { ascending: true }),
      sb.from("automation_rule_actions").select("*").order("sort_order", { ascending: true }),
    ]);
    setRules((r.data as AutomationRule[]) ?? []);
    setActions((a.data as AutomationAction[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const toggle = useCallback(async (id: string, enabled: boolean) => {
    await sb.from("automation_rules").update({ enabled }).eq("id", id);
    await reload();
  }, [reload]);

  return { rules, actions, loading, toggle, reload };
}
