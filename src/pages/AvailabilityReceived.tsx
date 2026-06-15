import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AppShell } from "@/components/ocean/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowLeft,
  Check,
  CalendarRange,
  Clock,
  MapPin,
  Stethoscope,
  Phone,
  PhoneCall,
  Plus,
  Loader2,
  Lock,
  CheckCircle2,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import {
  AVAILABILITY_STATUS_LABEL,
  AVAILABILITY_STATUS_TONE,
  AvailabilityStatus,
  CLINIC_OUTCOME_LABEL,
  CLINIC_OUTCOME_OPTIONS,
  CLINIC_OUTCOME_TONE,
  ClinicLogInput,
  ClinicLogOutcome,
  ClinicLogRow,
  PreferencesRow,
  YES_NO_UNKNOWN_OPTIONS,
  fmtShortDate,
  insertClinicLog,
  listClinicLogs,
  loadOptionsForRequest,
  loadPreferencesForRequest,
  loadRequestForReview,
  markClinicContacted,
  markReadyToBook,
} from "@/lib/availability-store";

interface RequestRow {
  id: string;
  client_id: string;
  advocate_id: string;
  status: AvailabilityStatus;
  appointment_category: string;
  appointment_purpose: string;
  provider_name: string | null;
  clinic_name: string | null;
  location: string | null;
  date_range_start: string;
  date_range_end: string;
  urgency: string;
  preferred_appointment_length_minutes: number | null;
  telehealth_acceptable: boolean;
  in_person_required: boolean;
  interpreter_needed: boolean;
  transport_considerations: string | null;
  client_facing_notes: string | null;
  client_responded_at: string | null;
  created_at: string;
}

const PREF_LABELS: Array<{ key: keyof PreferencesRow; label: string }> = [
  { key: "prefers_morning", label: "Mornings are best" },
  { key: "prefers_afternoon", label: "Afternoons are best" },
  { key: "prefers_after_work", label: "After work is best" },
  { key: "prefers_telehealth", label: "Telehealth is easier" },
  { key: "needs_transport", label: "May need transport help" },
  { key: "needs_interpreter", label: "May need interpreter" },
  { key: "cannot_attend_this_week", label: "Cannot attend this week" },
  { key: "needs_help_deciding", label: "Needs help deciding" },
  { key: "flexible", label: "Flexible" },
];

function fmtTime(t: string | null): string {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hh = parseInt(h, 10);
  const mer = hh >= 12 ? "PM" : "AM";
  const h12 = ((hh + 11) % 12) + 1;
  return `${h12}:${m} ${mer}`;
}

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AvailabilityReceived() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [req, setReq] = useState<RequestRow | null>(null);
  const [clientName, setClientName] = useState<string>("");
  const [options, setOptions] = useState<any[]>([]);
  const [prefs, setPrefs] = useState<PreferencesRow | null>(null);
  const [advocateNotes, setAdvocateNotes] = useState<string>("");
  const [logs, setLogs] = useState<ClinicLogRow[]>([]);
  const [markingReady, setMarkingReady] = useState(false);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = (await loadRequestForReview(id)) as RequestRow | null;
        if (!r) {
          if (!cancelled) setLoading(false);
          return;
        }
        if (cancelled) return;
        setReq(r);
        const [opts, p, ls, profile, notes] = await Promise.all([
          loadOptionsForRequest(id),
          loadPreferencesForRequest(id),
          listClinicLogs(id),
          supabase.from("profiles").select("full_name,email").eq("id", r.client_id).maybeSingle(),
          supabase.rpc("get_advocate_notes", { _request_id: id }),
        ]);
        if (cancelled) return;
        setOptions(opts);
        setPrefs(p);
        setLogs(ls);
        setClientName((profile.data?.full_name?.trim() as string) || (profile.data?.email as string) || "Client");
        setAdvocateNotes((notes.data as string | null) ?? "");
      } catch (e: any) {
        toast({ title: "Couldn't load request", description: e?.message ?? "", variant: "destructive" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const selected = useMemo(() => options.filter((o) => o.selected_by_client), [options]);
  const notSelected = useMemo(() => options.filter((o) => !o.selected_by_client), [options]);

  async function handleMarkReady() {
    if (!req) return;
    setMarkingReady(true);
    try {
      await markReadyToBook(req.id);
      setReq({ ...req, status: "ready_to_book" });
      toast({ title: "Availability marked ready to book." });
    } catch (e: any) {
      toast({ title: "Couldn't update status", description: e?.message ?? "", variant: "destructive" });
    } finally {
      setMarkingReady(false);
    }
  }

  async function handleLogSaved(updatedToClinicContacted: boolean) {
    if (!id || !req) return;
    const fresh = await listClinicLogs(id);
    setLogs(fresh);
    if (updatedToClinicContacted) {
      setReq({ ...req, status: "clinic_contacted" });
    }
    setShowForm(false);
  }

  if (loading) {
    return <AppShell role="advocate" title="Availability Received"><p className="text-muted-foreground">Loading…</p></AppShell>;
  }

  if (!req) {
    return (
      <AppShell role="advocate" title="Availability Received">
        <div className="glass-card p-6 max-w-xl">
          <p className="text-primary-deep">This request isn't available.</p>
          <Link to="/advocate/availability" className="inline-block mt-4">
            <Button variant="outline" className="rounded-full gap-2"><ArrowLeft className="h-4 w-4" /> Back</Button>
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      role="advocate"
      seoTitle="Availability Received"
      title="Availability Received"
      subtitle="Review the times your client can attend, then record clinic contact attempts."
    >
      <Link to="/advocate/availability" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary mb-4">
        <ArrowLeft className="h-4 w-4" /> All availability requests
      </Link>

      <div className="glass-card p-4 sm:p-5 mb-6 bg-gradient-card max-w-3xl">
        <p className="text-sm text-primary-deep/85 leading-relaxed">
          The client has not booked an appointment yet. Use these times when contacting the clinic. Clinic call notes stay private to the advocate.
        </p>
      </div>

      <div className="space-y-6 max-w-3xl">
        {/* Card 1 — Appointment summary */}
        <section className="glass-card p-5 sm:p-6 space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="font-display text-xl text-primary-deep">Appointment summary</h2>
              <p className="text-sm text-muted-foreground mt-1">For {clientName}</p>
            </div>
            <span className={`text-xs rounded-full px-2.5 py-1 ${AVAILABILITY_STATUS_TONE[req.status]}`}>
              {AVAILABILITY_STATUS_LABEL[req.status]}
            </span>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Info icon={<Stethoscope className="h-4 w-4" />} label="Category">
              {req.appointment_category.replace(/_/g, " ")}
            </Info>
            <Info icon={<Sparkles className="h-4 w-4" />} label="Urgency">{req.urgency}</Info>
            <Info icon={<Stethoscope className="h-4 w-4" />} label="Purpose">{req.appointment_purpose || "—"}</Info>
            {(req.provider_name || req.clinic_name) && (
              <Info icon={<Stethoscope className="h-4 w-4" />} label="Provider / clinic">
                {[req.provider_name, req.clinic_name].filter(Boolean).join(" · ")}
              </Info>
            )}
            {req.location && <Info icon={<MapPin className="h-4 w-4" />} label="Location">{req.location}</Info>}
            <Info icon={<CalendarRange className="h-4 w-4" />} label="Date range">
              {fmtShortDate(req.date_range_start)} → {fmtShortDate(req.date_range_end)}
            </Info>
            {req.preferred_appointment_length_minutes && (
              <Info icon={<Clock className="h-4 w-4" />} label="Length">{req.preferred_appointment_length_minutes} min</Info>
            )}
            <Info icon={<Check className="h-4 w-4" />} label="Format">
              {[
                req.telehealth_acceptable ? "Telehealth OK" : null,
                req.in_person_required ? "In-person required" : null,
                req.interpreter_needed ? "Interpreter needed" : null,
              ].filter(Boolean).join(" · ") || "No specific notes"}
            </Info>
          </div>
          {req.transport_considerations && (
            <div className="rounded-2xl bg-secondary/40 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Transport</p>
              <p className="text-sm text-primary-deep whitespace-pre-wrap">{req.transport_considerations}</p>
            </div>
          )}
          {req.client_facing_notes && (
            <div className="rounded-2xl bg-secondary/40 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Message shown to client</p>
              <p className="text-sm text-primary-deep whitespace-pre-wrap">{req.client_facing_notes}</p>
            </div>
          )}
          {advocateNotes && (
            <div className="rounded-2xl bg-accent/15 p-3 border border-accent/30">
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1.5">
                <Lock className="h-3 w-3" /> Private advocate notes
              </p>
              <p className="text-sm text-primary-deep whitespace-pre-wrap">{advocateNotes}</p>
            </div>
          )}
        </section>

        {/* Card 2 — Client availability */}
        <section className="glass-card p-5 sm:p-6 space-y-4">
          <div>
            <h2 className="font-display text-xl text-primary-deep">Client availability</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {req.client_responded_at
                ? `Shared ${new Date(req.client_responded_at).toLocaleDateString()}`
                : "Awaiting client response"}
            </p>
          </div>
          {(prefs?.flexible || prefs?.needs_help_deciding) && (
            <div className="rounded-2xl bg-accent/15 px-3 py-2 text-sm text-primary-deep">
              {prefs?.flexible && "Client said they're flexible. "}
              {prefs?.needs_help_deciding && "Client said they need help deciding."}
            </div>
          )}

          <div>
            <h3 className="text-sm font-semibold text-primary-deep mb-2">Times the client can attend</h3>
            {selected.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No specific times were selected.</p>
            ) : (
              <ul className="grid sm:grid-cols-2 gap-3">
                {selected.map((o) => <OptionCard key={o.id} option={o} selected />)}
              </ul>
            )}
          </div>

          {notSelected.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground mb-2">Times not selected</h3>
              <ul className="grid sm:grid-cols-2 gap-3">
                {notSelected.map((o) => <OptionCard key={o.id} option={o} selected={false} />)}
              </ul>
            </div>
          )}
        </section>

        {/* Card 3 — Preferences */}
        <section className="glass-card p-5 sm:p-6 space-y-4">
          <div>
            <h2 className="font-display text-xl text-primary-deep">Client preferences</h2>
            <p className="text-sm text-muted-foreground mt-1">What the client shared about their needs.</p>
          </div>
          {!prefs || PREF_LABELS.every((f) => !prefs[f.key]) && !prefs.client_notes ? (
            <p className="text-sm text-muted-foreground italic">No extra preferences were added.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {PREF_LABELS.filter((f) => !!prefs[f.key]).map((f) => (
                  <span key={f.key as string} className="text-sm rounded-full bg-accent/15 text-primary-deep px-3 py-1.5">
                    {f.label}
                  </span>
                ))}
              </div>
              {prefs.client_notes && (
                <div className="rounded-2xl bg-secondary/40 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Client note</p>
                  <p className="text-sm text-primary-deep whitespace-pre-wrap">{prefs.client_notes}</p>
                </div>
              )}
            </>
          )}
        </section>

        {/* Card 4 — Clinic call log */}
        <section className="glass-card p-5 sm:p-6 space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="font-display text-xl text-primary-deep flex items-center gap-2">
                <PhoneCall className="h-5 w-5 text-primary" /> Clinic call log
              </h2>
              <p className="text-sm text-muted-foreground mt-1">Private to you — track each call and outcome.</p>
            </div>
            {!showForm && (
              <Button onClick={() => setShowForm(true)} className="rounded-full gap-1.5">
                <Plus className="h-4 w-4" /> Add clinic contact
              </Button>
            )}
          </div>

          {showForm && (
            <ClinicLogForm
              requestId={req.id}
              currentStatus={req.status}
              onCancel={() => setShowForm(false)}
              onSaved={handleLogSaved}
            />
          )}

          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No clinic contacts logged yet.</p>
          ) : (
            <ul className="space-y-3">
              {logs.map((l) => <ClinicLogCard key={l.id} log={l} />)}
            </ul>
          )}
        </section>

        {/* Card 5 — Next step */}
        <section className="glass-card p-5 sm:p-6 space-y-3 bg-gradient-card">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-2xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
              <ChevronRight className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h2 className="font-display text-lg text-primary-deep">Next step</h2>
              <p className="text-sm text-primary-deep/85 mt-1">{nextStepCopy(req.status)}</p>
            </div>
          </div>
          {req.status === "client_responded" && (
            <Button onClick={handleMarkReady} disabled={markingReady} className="rounded-full">
              {markingReady ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Updating…</> : "Mark ready to book"}
            </Button>
          )}
          {req.status === "clinic_contacted" && (
            <Button
              onClick={() => navigate(`/advocate/availability/${req.id}/confirm`)}
              className="rounded-full bg-gradient-ocean shadow-soft gap-1.5"
            >
              <CheckCircle2 className="h-4 w-4" /> Create confirmed appointment
            </Button>
          )}
          {req.status === "appointment_confirmed" && (
            <Button
              onClick={() => navigate("/advocate/calendar")}
              variant="outline"
              className="rounded-full gap-1.5"
            >
              <CalendarRange className="h-4 w-4" /> View in calendar
            </Button>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function nextStepCopy(status: AvailabilityStatus): string {
  switch (status) {
    case "client_responded":
      return "Review the client's times, then mark this ready to book.";
    case "ready_to_book":
      return "Use the selected times to contact the clinic. Add each call or contact attempt below.";
    case "clinic_contacted":
      return "Clinic contact has started. Keep logging attempts until an appointment is ready to confirm.";
    case "appointment_confirmed":
      return "An appointment has been confirmed.";
    case "cancelled":
      return "This availability request has been cancelled.";
    default:
      return "Waiting for client response.";
  }
}

function Info({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-secondary/30 p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
        <span className="text-primary/70">{icon}</span> {label}
      </p>
      <p className="text-sm text-primary-deep mt-1 capitalize">{children}</p>
    </div>
  );
}

function OptionCard({ option, selected }: { option: any; selected: boolean }) {
  const date = fmtShortDate(option.date);
  const window =
    option.time_window === "specific" && option.start_time && option.end_time
      ? `${fmtTime(option.start_time)} – ${fmtTime(option.end_time)}`
      : option.time_window === "morning"
      ? "Morning"
      : option.time_window === "afternoon"
      ? "Afternoon"
      : "";
  return (
    <li
      className={`rounded-2xl border-2 p-4 ${
        selected
          ? "bg-primary/10 border-primary"
          : "bg-card border-border opacity-75"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          aria-hidden
          className={`h-6 w-6 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${
            selected ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/40"
          }`}
        >
          {selected && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-primary-deep">{option.label || `${date}${window ? ` · ${window}` : ""}`}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{date}{window ? ` · ${window}` : ""}</p>
          {selected && <p className="text-xs font-semibold text-primary mt-1.5">Selected by client</p>}
        </div>
      </div>
    </li>
  );
}

function ClinicLogCard({ log }: { log: ClinicLogRow }) {
  return (
    <li className="rounded-2xl border border-border bg-card p-4 space-y-2">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <p className="font-semibold text-primary-deep">{log.clinic_name}</p>
          <p className="text-xs text-muted-foreground">
            {new Date(log.contacted_at).toLocaleString()}
            {log.person_spoken_to ? ` · spoke to ${log.person_spoken_to}` : ""}
          </p>
        </div>
        <span className={`text-xs rounded-full px-2.5 py-0.5 ${CLINIC_OUTCOME_TONE[log.outcome]}`}>
          {CLINIC_OUTCOME_LABEL[log.outcome]}
        </span>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        {log.phone_number && (
          <span className="inline-flex items-center gap-1 text-muted-foreground"><Phone className="h-3 w-3" />{log.phone_number}</span>
        )}
        <span className="rounded-full bg-secondary/60 px-2 py-0.5 text-primary-deep">
          Accepts advocate: {log.accepts_advocate}
        </span>
        <span className="rounded-full bg-secondary/60 px-2 py-0.5 text-primary-deep">
          Authority form: {log.requires_authority_form}
        </span>
      </div>
      {log.notes && (
        <p className="text-sm text-primary-deep whitespace-pre-wrap rounded-xl bg-secondary/30 p-2">{log.notes}</p>
      )}
      {log.next_action && (
        <p className="text-sm text-primary-deep"><span className="text-xs uppercase tracking-wide text-muted-foreground mr-1">Next:</span>{log.next_action}</p>
      )}
      {log.outcome === "appointment_booked" && (
        <p className="text-xs text-primary-deep bg-accent/15 rounded-xl px-3 py-2">
          Appointment confirmation will be handled in the next step.
        </p>
      )}
    </li>
  );
}

function ClinicLogForm({
  requestId,
  currentStatus,
  onCancel,
  onSaved,
}: {
  requestId: string;
  currentStatus: AvailabilityStatus;
  onCancel: () => void;
  onSaved: (transitioned: boolean) => void;
}) {
  const [clinicName, setClinicName] = useState("");
  const [phone, setPhone] = useState("");
  const [contactedAt, setContactedAt] = useState(() => toLocalInput(new Date()));
  const [person, setPerson] = useState("");
  const [accepts, setAccepts] = useState<"yes" | "no" | "unknown">("unknown");
  const [authority, setAuthority] = useState<"yes" | "no" | "unknown">("unknown");
  const [outcome, setOutcome] = useState<ClinicLogOutcome>("not_contacted");
  const [notes, setNotes] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const e: Record<string, string> = {};
    if (!clinicName.trim()) e.clinic_name = "Please add the clinic name.";
    if (!contactedAt) e.contacted_at = "Please add when you contacted the clinic.";
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setSaving(true);
    try {
      const input: ClinicLogInput = {
        availability_request_id: requestId,
        clinic_name: clinicName.trim(),
        phone_number: phone.trim() || null,
        contacted_at: new Date(contactedAt).toISOString(),
        person_spoken_to: person.trim() || null,
        accepts_advocate: accepts,
        requires_authority_form: authority,
        outcome,
        notes: notes.trim() || null,
        next_action: nextAction.trim() || null,
      };
      await insertClinicLog(input);

      let transitioned = false;
      if (currentStatus === "ready_to_book") {
        try {
          await markClinicContacted(requestId);
          transitioned = true;
        } catch {
          // status guard may reject — non-fatal
        }
      }

      toast({
        title: transitioned ? "Clinic contact saved. Request marked as clinic contacted." : "Clinic contact saved.",
      });
      onSaved(transitioned);
    } catch (err: any) {
      toast({ title: "Couldn't save", description: err?.message ?? "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border-2 border-primary/30 bg-secondary/20 p-4 sm:p-5 space-y-4">
      <h3 className="font-display text-lg text-primary-deep">New clinic contact</h3>
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="clinic_name">Clinic name</Label>
          <Input id="clinic_name" value={clinicName} onChange={(e) => setClinicName(e.target.value)} className="rounded-2xl" />
          {errors.clinic_name && <p className="text-sm text-destructive/80">{errors.clinic_name}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Phone number <span className="text-muted-foreground font-normal">(optional)</span></Label>
          <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="rounded-2xl" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="contacted_at">When did you contact them?</Label>
          <Input id="contacted_at" type="datetime-local" value={contactedAt} onChange={(e) => setContactedAt(e.target.value)} className="rounded-2xl" />
          {errors.contacted_at && <p className="text-sm text-destructive/80">{errors.contacted_at}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="person">Person spoken to <span className="text-muted-foreground font-normal">(optional)</span></Label>
          <Input id="person" value={person} onChange={(e) => setPerson(e.target.value)} className="rounded-2xl" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="outcome">Outcome</Label>
          <Select value={outcome} onValueChange={(v: any) => setOutcome(v)}>
            <SelectTrigger id="outcome" className="rounded-2xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CLINIC_OUTCOME_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="accepts">Accepts advocate?</Label>
          <Select value={accepts} onValueChange={(v: any) => setAccepts(v)}>
            <SelectTrigger id="accepts" className="rounded-2xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              {YES_NO_UNKNOWN_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="authority">Requires authority form?</Label>
          <Select value={authority} onValueChange={(v: any) => setAuthority(v)}>
            <SelectTrigger id="authority" className="rounded-2xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              {YES_NO_UNKNOWN_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="notes">Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
          <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="rounded-2xl min-h-[80px]" />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="next_action">Next action <span className="text-muted-foreground font-normal">(optional)</span></Label>
          <Input id="next_action" value={nextAction} onChange={(e) => setNextAction(e.target.value)} className="rounded-2xl" placeholder="e.g. Call back Tuesday morning" />
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap pt-1">
        <Button onClick={handleSave} disabled={saving} className="rounded-full">
          {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Saving…</> : "Save clinic contact"}
        </Button>
        <Button onClick={onCancel} variant="ghost" className="rounded-full">Cancel</Button>
      </div>
    </div>
  );
}
