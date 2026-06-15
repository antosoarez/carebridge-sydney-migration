import { supabase } from "@/integrations/supabase/client";

export type AvailabilityStatus =
  | "draft"
  | "sent_to_client"
  | "waiting_for_client"
  | "client_responded"
  | "ready_to_book"
  | "clinic_contacted"
  | "appointment_confirmed"
  | "cancelled";

export const AVAILABILITY_STATUS_LABEL: Record<AvailabilityStatus, string> = {
  draft: "Draft",
  sent_to_client: "Sent to client",
  waiting_for_client: "Waiting for client",
  client_responded: "Client responded",
  ready_to_book: "Ready to book",
  clinic_contacted: "Clinic contacted",
  appointment_confirmed: "Appointment confirmed",
  cancelled: "Cancelled",
};

export const AVAILABILITY_STATUS_TONE: Record<AvailabilityStatus, string> = {
  draft: "bg-secondary/60 text-primary-deep",
  sent_to_client: "bg-primary/15 text-primary-deep",
  waiting_for_client: "bg-accent/20 text-primary-deep",
  client_responded: "bg-success/15 text-success",
  ready_to_book: "bg-success/20 text-success",
  clinic_contacted: "bg-primary/20 text-primary-deep",
  appointment_confirmed: "bg-success/25 text-success",
  cancelled: "bg-muted text-muted-foreground",
};

export const APPOINTMENT_CATEGORIES = [
  { value: "GP", label: "GP" },
  { value: "Specialist", label: "Specialist" },
  { value: "Hospital", label: "Hospital" },
  { value: "STI_clinic", label: "STI clinic" },
  { value: "Blood_test", label: "Blood test" },
  { value: "Ultrasound", label: "Ultrasound" },
  { value: "Imaging", label: "Imaging" },
  { value: "Pathology", label: "Pathology" },
  { value: "Follow_up", label: "Follow-up" },
  { value: "Other", label: "Other" },
];

export const URGENCY_OPTIONS: Array<{ value: "flexible" | "soon" | "important"; label: string }> = [
  { value: "flexible", label: "Flexible" },
  { value: "soon", label: "Soon" },
  { value: "important", label: "Important" },
];

export const APPT_LENGTH_OPTIONS = [
  { value: "", label: "Unknown" },
  { value: "15", label: "15 min" },
  { value: "30", label: "30 min" },
  { value: "45", label: "45 min" },
  { value: "60", label: "60 min" },
];

export interface DraftOption {
  // tempId used only client-side before save
  tempId: string;
  date: string; // yyyy-mm-dd — start of date frame
  date_to: string; // yyyy-mm-dd — end of date frame (inclusive). For single-day, equals date.
  time_window: "morning" | "afternoon" | "specific";
  start_time: string | null; // HH:MM
  end_time: string | null;
  label: string;
}

export function fmtShortDate(iso: string): string {
  try {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  } catch { return iso; }
}

/** Expand a yyyy-mm-dd range (inclusive) into individual date strings. */
export function expandDateRange(startISO: string, endISO: string): string[] {
  if (!startISO) return [];
  const end = endISO && endISO >= startISO ? endISO : startISO;
  const out: string[] = [];
  const d = new Date(startISO + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  if (isNaN(d.getTime()) || isNaN(e.getTime())) return [startISO];
  while (d <= e) {
    out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export function newTempId(): string {
  return `tmp_${Math.random().toString(36).slice(2, 10)}`;
}

// ===== AVAIL-D: Advocate review + clinic call log =====

export type ClinicLogOutcome =
  | "not_contacted"
  | "called_no_answer"
  | "waiting_for_callback"
  | "clinic_accepted_advocacy"
  | "clinic_requires_consent_form"
  | "appointment_offered"
  | "appointment_booked";

export type AcceptsAdvocate = "yes" | "no" | "unknown";
export type RequiresAuthorityForm = "yes" | "no" | "unknown";

export const CLINIC_OUTCOME_OPTIONS: Array<{ value: ClinicLogOutcome; label: string }> = [
  { value: "not_contacted", label: "Not contacted yet" },
  { value: "called_no_answer", label: "Called — no answer" },
  { value: "waiting_for_callback", label: "Waiting for callback" },
  { value: "clinic_accepted_advocacy", label: "Clinic accepted advocacy" },
  { value: "clinic_requires_consent_form", label: "Clinic requires consent form" },
  { value: "appointment_offered", label: "Appointment offered" },
  { value: "appointment_booked", label: "Appointment booked" },
];

export const CLINIC_OUTCOME_LABEL: Record<ClinicLogOutcome, string> = Object.fromEntries(
  CLINIC_OUTCOME_OPTIONS.map((o) => [o.value, o.label]),
) as Record<ClinicLogOutcome, string>;

export const YES_NO_UNKNOWN_OPTIONS: Array<{ value: "yes" | "no" | "unknown"; label: string }> = [
  { value: "unknown", label: "Unknown" },
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

export const CLINIC_OUTCOME_TONE: Record<ClinicLogOutcome, string> = {
  not_contacted: "bg-secondary/60 text-primary-deep",
  called_no_answer: "bg-accent/20 text-primary-deep",
  waiting_for_callback: "bg-accent/20 text-primary-deep",
  clinic_accepted_advocacy: "bg-success/15 text-success",
  clinic_requires_consent_form: "bg-accent/25 text-primary-deep",
  appointment_offered: "bg-primary/15 text-primary-deep",
  appointment_booked: "bg-success/20 text-success",
};

export interface ClinicLogRow {
  id: string;
  availability_request_id: string;
  advocate_id: string;
  clinic_name: string;
  phone_number: string | null;
  contacted_at: string;
  person_spoken_to: string | null;
  accepts_advocate: AcceptsAdvocate;
  requires_authority_form: RequiresAuthorityForm;
  outcome: ClinicLogOutcome;
  notes: string | null;
  next_action: string | null;
  created_at: string;
}

export interface ClinicLogInput {
  availability_request_id: string;
  clinic_name: string;
  phone_number: string | null;
  contacted_at: string;
  person_spoken_to: string | null;
  accepts_advocate: AcceptsAdvocate;
  requires_authority_form: RequiresAuthorityForm;
  outcome: ClinicLogOutcome;
  notes: string | null;
  next_action: string | null;
}

export interface PreferencesRow {
  id?: string;
  availability_request_id: string;
  prefers_morning: boolean;
  prefers_afternoon: boolean;
  prefers_after_work: boolean;
  prefers_telehealth: boolean;
  needs_transport: boolean;
  needs_interpreter: boolean;
  cannot_attend_this_week: boolean;
  needs_help_deciding: boolean;
  flexible: boolean;
  client_notes: string | null;
}

export async function loadRequestForReview(id: string) {
  const { data, error } = await supabase
    .from("availability_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function loadOptionsForRequest(requestId: string) {
  const { data, error } = await supabase
    .from("availability_options")
    .select("*")
    .eq("availability_request_id", requestId)
    .order("date", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function loadPreferencesForRequest(requestId: string): Promise<PreferencesRow | null> {
  const { data, error } = await supabase
    .from("client_availability_preferences")
    .select("*")
    .eq("availability_request_id", requestId)
    .maybeSingle();
  if (error) throw error;
  return (data as PreferencesRow | null) ?? null;
}

export async function listClinicLogs(requestId: string): Promise<ClinicLogRow[]> {
  const { data, error } = await supabase
    .from("clinic_contact_logs")
    .select("*")
    .eq("availability_request_id", requestId)
    .order("contacted_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ClinicLogRow[];
}

export async function insertClinicLog(input: ClinicLogInput): Promise<void> {
  // advocate_id is set server-side by clinic_contact_logs_stamp trigger
  const { error } = await supabase.from("clinic_contact_logs").insert(input as any);
  if (error) throw error;
}

export async function markReadyToBook(requestId: string): Promise<void> {
  const { error } = await supabase
    .from("availability_requests")
    .update({ status: "ready_to_book" })
    .eq("id", requestId);
  if (error) throw error;
}

export async function markClinicContacted(requestId: string): Promise<void> {
  const { error } = await supabase
    .from("availability_requests")
    .update({ status: "clinic_contacted" })
    .eq("id", requestId);
  if (error) throw error;
}

// ===== AVAIL-E: Create Confirmed Appointment =====

export type AppointmentMode = "in_person" | "telehealth" | "phone" | "unknown";

export const APPOINTMENT_MODE_OPTIONS: Array<{ value: AppointmentMode; label: string }> = [
  { value: "unknown", label: "Unknown / unspecified" },
  { value: "in_person", label: "In-person" },
  { value: "telehealth", label: "Telehealth (video)" },
  { value: "phone", label: "Phone" },
];

export const APPOINTMENT_MODE_LABEL: Record<AppointmentMode, string> = {
  in_person: "In-person",
  telehealth: "Telehealth",
  phone: "Phone",
  unknown: "Unknown",
};

export interface ConfirmedAppointmentInput {
  availability_request_id: string;
  client_id: string;
  created_by: string;
  title: string;
  category: string;
  starts_at: string;
  ends_at: string | null;
  provider_name: string | null;
  practitioner_name: string | null;
  location: string | null;
  client_visible_notes: string | null;
  advocate_private_notes: string | null;
  preparation_instructions: string | null;
  what_to_bring: string | null;
}

export async function findAppointmentForRequest(requestId: string): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from("appointments")
    .select("id")
    .eq("availability_request_id", requestId)
    .maybeSingle();
  if (error) throw error;
  return (data as { id: string } | null) ?? null;
}

export async function createConfirmedAppointment(input: ConfirmedAppointmentInput): Promise<{ id: string; statusUpdated: boolean }> {
  const { data, error } = await supabase
    .from("appointments")
    .insert({ ...input, outcome: "scheduled" } as any)
    .select("id")
    .single();
  if (error) throw error;

  let statusUpdated = false;
  const { error: statusErr } = await supabase
    .from("availability_requests")
    .update({ status: "appointment_confirmed" })
    .eq("id", input.availability_request_id);
  if (!statusErr) statusUpdated = true;

  // Fire-and-forget: confirmation notifications (email + push, client + advocate).
  // Never block the UI on this — appointment is already saved.
  try {
    void supabase.functions.invoke("notify-appointment-confirmed", {
      body: { appointment_id: (data as any).id },
    });
  } catch (e) {
    console.warn("notify-appointment-confirmed invoke failed", e);
  }

  return { id: (data as any).id as string, statusUpdated };
}

