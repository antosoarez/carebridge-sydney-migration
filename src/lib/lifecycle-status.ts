import type { Database } from "@/integrations/supabase/types";

export type LifecycleStatus = Database["public"]["Enums"]["client_lifecycle_status"];

export const LIFECYCLE_STATUSES: LifecycleStatus[] = [
  "New enquiry",
  "Invited",
  "Invite accepted",
  "Onboarding incomplete",
  "Onboarding complete",
  "Active",
  "Waiting on client",
  "Waiting on clinic",
  "Appointment upcoming",
  "Report in progress",
  "Payment outstanding",
  "Follow-up required",
  "Completed",
  "Ongoing support",
  "Inactive",
];

type Bucket = "active" | "onboarding" | "waiting" | "closed";

const BUCKET: Record<LifecycleStatus, Bucket> = {
  "New enquiry": "onboarding",
  "Invited": "onboarding",
  "Invite accepted": "onboarding",
  "Onboarding incomplete": "onboarding",
  "Onboarding complete": "onboarding",
  "Active": "active",
  "Waiting on client": "waiting",
  "Waiting on clinic": "waiting",
  "Appointment upcoming": "active",
  "Report in progress": "active",
  "Payment outstanding": "active",
  "Follow-up required": "active",
  "Completed": "closed",
  "Ongoing support": "active",
  "Inactive": "closed",
};

const BUCKET_ORDER: Record<Bucket, number> = {
  active: 0,
  waiting: 1,
  onboarding: 2,
  closed: 3,
};

export function lifecycleSortIndex(s: LifecycleStatus | null | undefined): number {
  if (!s) return BUCKET_ORDER.onboarding;
  return BUCKET_ORDER[BUCKET[s]];
}

// Soft, calm palette using existing status tokens.
export function lifecycleBadgeClass(s: LifecycleStatus | null | undefined): string {
  if (!s) return "bg-status-pending text-status-pending-fg";
  switch (s) {
    case "Active":
    case "Ongoing support":
    case "Appointment upcoming":
    case "Report in progress":
      return "bg-status-progress text-status-progress-fg";
    case "Waiting on client":
    case "Waiting on clinic":
    case "Follow-up required":
      return "bg-status-waiting text-status-waiting-fg";
    case "Payment outstanding":
      return "bg-status-overdue text-status-overdue-fg";
    case "Completed":
      return "bg-status-completed text-status-completed-fg";
    case "Inactive":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-status-pending text-status-pending-fg";
  }
}
