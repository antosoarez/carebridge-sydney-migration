export type TaskStatus = "pending" | "progress" | "waiting" | "uploaded" | "completed" | "overdue";

export interface Task {
  id: string;
  clientId: string;
  title: string;
  description?: string;
  status: TaskStatus;
  dueDate: string;
  category: "appointment" | "document" | "communication" | "test";
  createdAt: string;
}

export type ClientTier = "tier_1" | "tier_2" | "tier_3";
export type ClientReportStatus = "not_started" | "in_progress" | "completed" | "updating" | "finished";
export type ClientColourKey =
  | "ocean" | "teal" | "seafoam" | "sky" | "mist" | "sand" | "coral" | "lavender";
export type ClientPaymentStatus = "unpaid" | "half_paid" | "full_paid";

export const PAYMENT_STATUS_LABEL: Record<ClientPaymentStatus, string> = {
  unpaid: "Unpaid",
  half_paid: "Half paid",
  full_paid: "Full paid",
};


export const TIER_LABEL: Record<ClientTier, string> = {
  tier_1: "Tier 1",
  tier_2: "Tier 2",
  tier_3: "Tier 3",
};

export const REPORT_STATUS_LABEL: Record<ClientReportStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
  updating: "Updating",
  finished: "Finished",
};

// Soft ocean-toned palette (HSL). Used for avatar + future calendar entries.
export const CLIENT_COLOURS: Record<ClientColourKey, { label: string; bg: string; ring: string; text: string }> = {
  ocean:    { label: "Ocean",    bg: "hsl(205 55% 55%)", ring: "hsl(205 55% 45%)", text: "hsl(0 0% 100%)" },
  teal:     { label: "Teal",     bg: "hsl(180 40% 50%)", ring: "hsl(180 40% 40%)", text: "hsl(0 0% 100%)" },
  seafoam:  { label: "Seafoam",  bg: "hsl(155 40% 65%)", ring: "hsl(155 40% 50%)", text: "hsl(180 30% 18%)" },
  sky:      { label: "Sky",      bg: "hsl(200 70% 78%)", ring: "hsl(200 60% 60%)", text: "hsl(210 40% 22%)" },
  mist:     { label: "Mist",     bg: "hsl(210 25% 85%)", ring: "hsl(210 20% 65%)", text: "hsl(210 35% 25%)" },
  sand:     { label: "Sand",     bg: "hsl(38 55% 82%)",  ring: "hsl(38 45% 60%)",  text: "hsl(28 40% 25%)" },
  coral:    { label: "Coral",    bg: "hsl(10 65% 78%)",  ring: "hsl(10 55% 60%)",  text: "hsl(10 45% 25%)" },
  lavender: { label: "Lavender", bg: "hsl(255 45% 82%)", ring: "hsl(255 35% 60%)", text: "hsl(255 35% 25%)" },
};

import type { LifecycleStatus } from "@/lib/lifecycle-status";

export interface ClientCase {
  id: string;
  name: string;
  email: string;
  avatarColor: string;
  condition: string;
  clinic: string;
  acceptsAdvocacy: boolean;
  paymentStatus: "paid" | "unpaid" | "partial";
  invoiceStatus: "sent" | "not_sent";
  amount: number;
  amountPaid: number;
  progress: number;
  internalNotes: string;
  startedAt: string;
  mustChangePassword?: boolean;
  activatedAt?: string | null;
  status?: "invited" | "needs_password_change" | "active";
  tier: ClientTier;
  reportStatus: ClientReportStatus;
  clientColour: ClientColourKey;
  paymentState: ClientPaymentStatus;
  reportProgress: number;
  reportRequestedFrom: string | null;
  reportRequestedTo: string | null;
  clientProgress: number;
  lifecycleStatus: LifecycleStatus | null;
}

export interface AppointmentItem {
  id: string;
  clientId: string;
  title: string;
  date: string;
  location: string;
}

export interface DocItem {
  id: string;
  clientId: string;
  name: string;
  uploadedBy: "client" | "advocate";
  uploadedAt: string;
  size: string;
  type: string;
}

export interface TimelineEvent {
  id: string;
  clientId: string;
  type: "task" | "upload" | "note" | "appointment";
  text: string;
  at: string;
}

export interface EmailTemplate {
  id: string;
  title: string;
  subject: string;
  body: string;
}

export function daysLeft(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export function countdownLabel(iso: string): string {
  const d = daysLeft(iso);
  if (d < 0) return `${Math.abs(d)} day${Math.abs(d) === 1 ? "" : "s"} past`;
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  return `${d} days left`;
}

const AVATAR_GRADIENTS = [
  "from-primary to-accent",
  "from-accent to-primary-glow",
  "from-primary-glow to-accent",
  "from-accent to-primary",
];

export function avatarColorFromId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

function fmtBytes(b?: number | null): string {
  if (!b || b <= 0) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

export const fileSize = fmtBytes;
