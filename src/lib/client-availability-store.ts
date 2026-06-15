import { supabase } from "@/integrations/supabase/client";
import type { AvailabilityStatus } from "@/lib/availability-store";

const REQ_COLS =
  "id, client_id, advocate_id, appointment_category, appointment_purpose, provider_name, clinic_name, location, date_range_start, date_range_end, urgency, preferred_appointment_length_minutes, status, interpreter_needed, telehealth_acceptable, in_person_required, transport_considerations, client_facing_notes, created_at, updated_at, sent_at, client_responded_at";

export interface ClientRequestRow {
  id: string;
  client_id: string;
  advocate_id: string;
  appointment_category: string;
  appointment_purpose: string;
  provider_name: string | null;
  clinic_name: string | null;
  location: string | null;
  date_range_start: string;
  date_range_end: string;
  urgency: "flexible" | "soon" | "important";
  preferred_appointment_length_minutes: number | null;
  status: AvailabilityStatus;
  interpreter_needed: boolean;
  telehealth_acceptable: boolean;
  in_person_required: boolean;
  transport_considerations: string | null;
  client_facing_notes: string | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  client_responded_at: string | null;
}

export interface OptionRow {
  id: string;
  availability_request_id: string;
  date: string;
  time_window: "morning" | "afternoon" | "specific";
  start_time: string | null;
  end_time: string | null;
  label: string;
  selected_by_client: boolean;
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

export function emptyPreferences(requestId: string): PreferencesRow {
  return {
    availability_request_id: requestId,
    prefers_morning: false,
    prefers_afternoon: false,
    prefers_after_work: false,
    prefers_telehealth: false,
    needs_transport: false,
    needs_interpreter: false,
    cannot_attend_this_week: false,
    needs_help_deciding: false,
    flexible: false,
    client_notes: null,
  };
}

export async function listVisibleForClient(): Promise<ClientRequestRow[]> {
  const { data, error } = await supabase
    .from("availability_requests")
    .select(REQ_COLS)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as ClientRequestRow[];
}

export async function loadRequestForClient(id: string): Promise<ClientRequestRow | null> {
  const { data, error } = await supabase
    .from("availability_requests")
    .select(REQ_COLS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as ClientRequestRow | null) ?? null;
}

export async function loadOptions(requestId: string): Promise<OptionRow[]> {
  const { data, error } = await supabase
    .from("availability_options")
    .select("id, availability_request_id, date, time_window, start_time, end_time, label, selected_by_client")
    .eq("availability_request_id", requestId)
    .order("date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as OptionRow[];
}

export async function loadPreferences(requestId: string): Promise<PreferencesRow | null> {
  const { data, error } = await supabase
    .from("client_availability_preferences")
    .select("*")
    .eq("availability_request_id", requestId)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as PreferencesRow | null) ?? null;
}

/** Try to advance sent_to_client -> waiting_for_client. Silently no-ops on failure. */
export async function markWaitingForClient(req: ClientRequestRow): Promise<void> {
  if (req.status !== "sent_to_client") return;
  const { error } = await supabase
    .from("availability_requests")
    .update({ status: "waiting_for_client" })
    .eq("id", req.id);
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("Could not advance status to waiting_for_client (non-blocking)", error.message);
  }
}

export async function toggleOptionSelected(optionId: string, selected: boolean): Promise<void> {
  const { error } = await supabase
    .from("availability_options")
    .update({ selected_by_client: selected })
    .eq("id", optionId);
  if (error) throw error;
}

export async function addClientOption(input: {
  availability_request_id: string;
  date: string;
  start_time: string;
  end_time: string;
}): Promise<OptionRow> {
  const { data, error } = await supabase
    .from("availability_options")
    .insert({
      availability_request_id: input.availability_request_id,
      date: input.date,
      time_window: "specific",
      start_time: input.start_time,
      end_time: input.end_time,
      label: "Client suggested",
      selected_by_client: true,
    })
    .select("id, availability_request_id, date, time_window, start_time, end_time, label, selected_by_client")
    .single();
  if (error) throw error;
  return data as unknown as OptionRow;
}

/** Insert one option per day in [dateFrom, dateTo]. Returns created rows. */
export async function addClientOptionRange(input: {
  availability_request_id: string;
  date_from: string;
  date_to: string;
  start_time: string;
  end_time: string;
}): Promise<OptionRow[]> {
  const days: string[] = [];
  const d = new Date(input.date_from + "T00:00:00");
  const e = new Date((input.date_to || input.date_from) + "T00:00:00");
  if (isNaN(d.getTime()) || isNaN(e.getTime())) return [];
  while (d <= e) {
    days.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  if (days.length === 0) return [];
  const rows = days.map((date) => ({
    availability_request_id: input.availability_request_id,
    date,
    time_window: "specific" as const,
    start_time: input.start_time,
    end_time: input.end_time,
    label: "Client suggested",
    selected_by_client: true,
  }));
  const { data, error } = await supabase
    .from("availability_options")
    .insert(rows)
    .select("id, availability_request_id, date, time_window, start_time, end_time, label, selected_by_client");
  if (error) throw error;
  return (data ?? []) as unknown as OptionRow[];
}

export async function deleteClientOption(optionId: string): Promise<void> {
  const { error } = await supabase.from("availability_options").delete().eq("id", optionId);
  if (error) throw error;
}

export async function upsertPreferences(prefs: PreferencesRow): Promise<void> {
  if (prefs.id) {
    const { error } = await supabase
      .from("client_availability_preferences")
      .update({
        prefers_morning: prefs.prefers_morning,
        prefers_afternoon: prefs.prefers_afternoon,
        prefers_after_work: prefs.prefers_after_work,
        prefers_telehealth: prefs.prefers_telehealth,
        needs_transport: prefs.needs_transport,
        needs_interpreter: prefs.needs_interpreter,
        cannot_attend_this_week: prefs.cannot_attend_this_week,
        needs_help_deciding: prefs.needs_help_deciding,
        flexible: prefs.flexible,
        client_notes: prefs.client_notes,
      })
      .eq("id", prefs.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("client_availability_preferences")
      .insert({
        availability_request_id: prefs.availability_request_id,
        prefers_morning: prefs.prefers_morning,
        prefers_afternoon: prefs.prefers_afternoon,
        prefers_after_work: prefs.prefers_after_work,
        prefers_telehealth: prefs.prefers_telehealth,
        needs_transport: prefs.needs_transport,
        needs_interpreter: prefs.needs_interpreter,
        cannot_attend_this_week: prefs.cannot_attend_this_week,
        needs_help_deciding: prefs.needs_help_deciding,
        flexible: prefs.flexible,
        client_notes: prefs.client_notes,
      });
    if (error) throw error;
  }
}

export async function submitResponse(requestId: string): Promise<void> {
  const { error } = await supabase
    .from("availability_requests")
    .update({ status: "client_responded" })
    .eq("id", requestId);
  if (error) throw error;
}

export async function countPendingForClient(): Promise<number> {
  const { count, error } = await supabase
    .from("availability_requests")
    .select("id", { count: "exact", head: true })
    .in("status", ["sent_to_client", "waiting_for_client"]);
  if (error) return 0;
  return count ?? 0;
}
