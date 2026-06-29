import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { EMPTY_INTAKE, type ClientIntakeRecord } from "./client-intake-types";

export function useClientIntake(clientId: string | undefined) {
  const [data, setData] = useState<ClientIntakeRecord>(EMPTY_INTAKE);
  const [loading, setLoading] = useState(true);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    if (!clientId) return;
    (async () => {
      setLoading(true);
      const { data: row, error } = await supabase
        .from("client_intake")
        .select("*")
        .eq("client_id", clientId)
        .maybeSingle();
      if (cancelled) return;
      if (error && error.code !== "PGRST116") {
        setError(error.message);
      }
      if (row) {
        // Map the typed DB row onto ClientIntakeRecord, coercing nulls to "".
        const mapped: ClientIntakeRecord = { ...EMPTY_INTAKE };
        for (const key of Object.keys(EMPTY_INTAKE) as (keyof ClientIntakeRecord)[]) {
          const value = (row as Record<string, unknown>)[key];
          if (key === "services_interested") {
            mapped.services_interested = Array.isArray(value) ? (value as string[]) : [];
          } else if (value !== null && value !== undefined) {
            (mapped as Record<string, unknown>)[key] = value;
          }
        }
        mapped.submitted_at = row.submitted_at ?? null;
        setData(mapped);
        setSavedAt(row.updated_at ?? row.created_at ?? null);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const save = useCallback(
    async (next: ClientIntakeRecord, opts?: { submit?: boolean }) => {
      if (!clientId) return;
      setSaving(true);
      setError(null);
      const payload: any = {
        client_id: clientId,
        ...next,
        updated_at: new Date().toISOString(),
      };
      if (opts?.submit) payload.submitted_at = new Date().toISOString();
      const { error } = await supabase
        .from("client_intake")
        .upsert(payload, { onConflict: "client_id" });
      setSaving(false);
      if (error) {
        setError(error.message);
        return { error: error.message };
      }
      setSavedAt(payload.updated_at);
      if (opts?.submit) {
        setData((d) => ({ ...d, submitted_at: payload.submitted_at }));
      }
      return { error: null };
    },
    [clientId],
  );

  const update = useCallback(
    (patch: Partial<ClientIntakeRecord>) => {
      setData((prev) => {
        const next = { ...prev, ...patch };
        dirtyRef.current = true;
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          void save(next);
          dirtyRef.current = false;
        }, 800);
        return next;
      });
    },
    [save],
  );

  return { data, setData, update, save, loading, saving, savedAt, error };
}
