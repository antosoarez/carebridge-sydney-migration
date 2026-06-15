import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const SERVICE_TYPES = [
  "Appointment preparation",
  "Appointment attendance",
  "Health admin support",
  "Document organisation",
  "Care coordination",
  "Report preparation",
  "Ongoing advocacy support",
  "Other",
] as const;
export type ServiceType = typeof SERVICE_TYPES[number];

export const CASE_STATUSES = [
  "New",
  "Discovery",
  "Agreement pending",
  "Payment pending",
  "In progress",
  "Waiting on client",
  "Waiting on clinic",
  "Follow-up required",
  "Completed",
  "Ongoing support",
  "Closed",
] as const;
export type CaseStatus = typeof CASE_STATUSES[number];

export const CASE_OPEN_STATUSES: CaseStatus[] = CASE_STATUSES.filter(
  (s) => s !== "Completed" && s !== "Closed",
) as CaseStatus[];

export const COMPLEXITY_LEVELS = ["Simple", "Moderate", "Complex"] as const;
export type ComplexityLevel = typeof COMPLEXITY_LEVELS[number];

export const CASE_PAYMENT_STATES = [
  "Unpaid",
  "Deposit paid",
  "Partially paid",
  "Paid",
  "Overdue",
  "Waived",
  "N/A",
] as const;
export type CasePaymentState = typeof CASE_PAYMENT_STATES[number];

export interface ClientCaseRow {
  id: string;
  client_id: string;
  case_title: string;
  service_type: ServiceType;
  case_status: CaseStatus;
  tier: string | null;
  payment_state: CasePaymentState | null;
  primary_goal: string | null;
  main_advocacy_area: string | null;
  complexity_level: ComplexityLevel | null;
  next_action: string | null;
  next_action_due_at: string | null;
  opened_at: string;
  closed_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export function useClientCases(clientId: string | undefined) {
  const [rows, setRows] = useState<ClientCaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("client_cases")
        .select("*")
        .eq("client_id", clientId)
        .order("opened_at", { ascending: false });
      if (!cancelled) {
        setRows((data as ClientCaseRow[]) ?? []);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [clientId, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { rows, loading, reload };
}

export function caseStatusBadgeClass(s: CaseStatus): string {
  switch (s) {
    case "Completed":
      return "bg-status-completed text-status-completed-fg";
    case "Closed":
      return "bg-muted text-muted-foreground";
    case "In progress":
    case "Ongoing support":
      return "bg-status-progress text-status-progress-fg";
    case "Waiting on client":
    case "Waiting on clinic":
    case "Follow-up required":
      return "bg-status-waiting text-status-waiting-fg";
    case "Payment pending":
      return "bg-status-overdue text-status-overdue-fg";
    default:
      return "bg-status-pending text-status-pending-fg";
  }
}
