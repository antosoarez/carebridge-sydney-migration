import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CalendarCheck, Check, Loader2, Lock, Sparkles } from "lucide-react";
import { AppShell } from "@/components/ocean/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  APPOINTMENT_CATEGORIES,
  APPOINTMENT_MODE_LABEL,
  APPOINTMENT_MODE_OPTIONS,
  AppointmentMode,
  AvailabilityStatus,
  ConfirmedAppointmentInput,
  createConfirmedAppointment,
  findAppointmentForRequest,
  fmtShortDate,
  loadOptionsForRequest,
  loadRequestForReview,
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
}

function fmtTime(t: string | null): string {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hh = parseInt(h, 10);
  const mer = hh >= 12 ? "PM" : "AM";
  const h12 = ((hh + 11) % 12) + 1;
  return `${h12}:${m} ${mer}`;
}

function inferMode(r: RequestRow): AppointmentMode {
  if (r.in_person_required) return "in_person";
  if (r.telehealth_acceptable) return "telehealth";
  return "unknown";
}

function addMinutes(date: string, time: string, minutes: number): string {
  const [y, mo, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const start = new Date(y, (mo ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0, 0);
  const end = new Date(start.getTime() + minutes * 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(end.getHours())}:${pad(end.getMinutes())}`;
}

function toIso(date: string, time: string): string {
  const [y, mo, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(y, (mo ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0, 0).toISOString();
}

export default function AvailabilityConfirm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [req, setReq] = useState<RequestRow | null>(null);
  const [clientName, setClientName] = useState("");
  const [selectedOptions, setSelectedOptions] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Form state
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [provider, setProvider] = useState("");
  const [clinic, setClinic] = useState("");
  const [practitioner, setPractitioner] = useState("");
  const [location, setLocation] = useState("");
  const [mode, setMode] = useState<AppointmentMode>("unknown");
  const [clientVisibleNotes, setClientVisibleNotes] = useState("");
  const [advocatePrivateNotes, setAdvocatePrivateNotes] = useState("");
  const [preparation, setPreparation] = useState("");
  const [whatToBring, setWhatToBring] = useState("");

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const existing = await findAppointmentForRequest(id);
        if (existing && !cancelled) {
          toast({ title: "Appointment already exists for this request." });
          navigate("/advocate/calendar");
          return;
        }
        const r = (await loadRequestForReview(id)) as RequestRow | null;
        if (!r) {
          if (!cancelled) setLoading(false);
          return;
        }
        const allowed: AvailabilityStatus[] = ["clinic_contacted"];
        if (!allowed.includes(r.status)) {
          toast({
            title: "Not ready yet",
            description: "Add a clinic contact log before confirming this appointment.",
            variant: "destructive",
          });
          navigate(`/advocate/availability/${r.id}/review`);
          return;
        }
        const [opts, profile] = await Promise.all([
          loadOptionsForRequest(id),
          supabase.from("profiles").select("full_name,email").eq("id", r.client_id).maybeSingle(),
        ]);
        if (cancelled) return;
        setReq(r);
        setSelectedOptions((opts ?? []).filter((o: any) => o.selected_by_client));
        setClientName(
          (profile.data?.full_name?.trim() as string) || (profile.data?.email as string) || "Client",
        );

        // Pre-fill form
        setTitle(r.appointment_purpose || "");
        setCategory(r.appointment_category || "");
        setProvider(r.provider_name || "");
        setClinic(r.clinic_name || "");
        setLocation(r.location || "");
        setMode(inferMode(r));
      } catch (e: any) {
        toast({ title: "Couldn't load request", description: e?.message ?? "", variant: "destructive" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, navigate]);

  const lengthMinutes = req?.preferred_appointment_length_minutes ?? 30;

  function useSelectedOption(o: any) {
    if (o.date) setDate(o.date);
    if (o.time_window === "specific" && o.start_time) {
      const st = (o.start_time as string).slice(0, 5);
      setStartTime(st);
      if (o.end_time) setEndTime((o.end_time as string).slice(0, 5));
      else setEndTime(addMinutes(o.date, st, lengthMinutes));
    }
    toast({ title: "Filled from client's selected time." });
  }

  async function handleSave() {
    if (!req || !user) return;
    const e: Record<string, string> = {};
    if (!date) e.date = "Please add the appointment date and time.";
    if (!startTime) e.startTime = e.date ?? "Please add the appointment date and time.";
    if (!title.trim()) e.title = "Please add a title or purpose.";
    if (!category) e.category = "Please pick a category.";
    if (endTime && startTime && endTime < startTime) e.endTime = "Please check the appointment end time.";
    setErrors(e);
    if (Object.keys(e).length) return;

    setSaving(true);
    try {
      // Re-check duplicate just before insert
      const dup = await findAppointmentForRequest(req.id);
      if (dup) {
        toast({ title: "An appointment already exists for this request." });
        navigate("/advocate/calendar");
        return;
      }

      const effectiveEnd = endTime || addMinutes(date, startTime, lengthMinutes);
      const locationCombined = (() => {
        const c = clinic.trim();
        const l = location.trim();
        if (c && l) return `${c} — ${l}`;
        return c || l || null;
      })();
      const visibleNotesCombined = (() => {
        const base = clientVisibleNotes.trim();
        if (mode === "unknown") return base || null;
        const modeLine = `Mode: ${APPOINTMENT_MODE_LABEL[mode]}`;
        return base ? `${modeLine}\n\n${base}` : modeLine;
      })();

      const input: ConfirmedAppointmentInput = {
        availability_request_id: req.id,
        client_id: req.client_id,
        created_by: user.id,
        title: title.trim(),
        category,
        starts_at: toIso(date, startTime),
        ends_at: toIso(date, effectiveEnd),
        provider_name: provider.trim() || null,
        practitioner_name: practitioner.trim() || null,
        location: locationCombined,
        client_visible_notes: visibleNotesCombined,
        advocate_private_notes: advocatePrivateNotes.trim() || null,
        preparation_instructions: preparation.trim() || null,
        what_to_bring: whatToBring.trim() || null,
      };

      const { statusUpdated } = await createConfirmedAppointment(input);
      if (statusUpdated) {
        toast({ title: "Appointment confirmed." });
      } else {
        toast({
          title: "Appointment created.",
          description: "Couldn't mark the availability request as confirmed — please review its status.",
        });
      }
      navigate("/advocate/calendar");
    } catch (err: any) {
      toast({ title: "Couldn't save", description: err?.message ?? "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <AppShell role="advocate" title="Create Confirmed Appointment">
        <p className="text-muted-foreground">Loading…</p>
      </AppShell>
    );
  }

  if (!req) {
    return (
      <AppShell role="advocate" title="Create Confirmed Appointment">
        <div className="glass-card p-6 max-w-xl">
          <p className="text-primary-deep">This request isn't available.</p>
          <Link to="/advocate/availability" className="inline-block mt-4">
            <Button variant="outline" className="rounded-full gap-2">
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      role="advocate"
      seoTitle="Create Confirmed Appointment"
      title="Create Confirmed Appointment"
      subtitle="Add the appointment details so it appears in both calendars."
    >
      <Link
        to={`/advocate/availability/${req.id}/review`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary mb-4"
      >
        <ArrowLeft className="h-4 w-4" /> Back to availability review
      </Link>

      <div className="glass-card p-4 sm:p-5 mb-6 bg-gradient-card max-w-3xl">
        <p className="text-sm text-primary-deep/85 leading-relaxed">
          This is now a real appointment. The client will see it in their calendar. Notifications and reminders
          will be connected in a later step.
        </p>
      </div>

      <div className="space-y-6 max-w-3xl">
        {/* Card A — Reference */}
        <section className="glass-card p-5 sm:p-6 space-y-4">
          <div>
            <h2 className="font-display text-xl text-primary-deep">From the availability request</h2>
            <p className="text-sm text-muted-foreground mt-1">For {clientName}</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <Mini label="Category">{req.appointment_category.replace(/_/g, " ")}</Mini>
            <Mini label="Urgency">{req.urgency}</Mini>
            <Mini label="Purpose">{req.appointment_purpose || "—"}</Mini>
            {(req.provider_name || req.clinic_name) && (
              <Mini label="Provider / clinic">
                {[req.provider_name, req.clinic_name].filter(Boolean).join(" · ")}
              </Mini>
            )}
            {req.location && <Mini label="Location">{req.location}</Mini>}
            <Mini label="Date range">
              {fmtShortDate(req.date_range_start)} → {fmtShortDate(req.date_range_end)}
            </Mini>
            {req.preferred_appointment_length_minutes && (
              <Mini label="Preferred length">{req.preferred_appointment_length_minutes} min</Mini>
            )}
            <Mini label="Format">
              {[
                req.telehealth_acceptable ? "Telehealth OK" : null,
                req.in_person_required ? "In-person required" : null,
                req.interpreter_needed ? "Interpreter" : null,
              ]
                .filter(Boolean)
                .join(" · ") || "No specific notes"}
            </Mini>
          </div>
          {req.transport_considerations && (
            <div className="rounded-2xl bg-secondary/40 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Transport</p>
              <p className="text-sm text-primary-deep whitespace-pre-wrap">{req.transport_considerations}</p>
            </div>
          )}

          <div className="pt-2">
            <h3 className="text-sm font-semibold text-primary-deep mb-2 flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-primary" /> Times the client selected
            </h3>
            {selectedOptions.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                No specific times were selected — pick any date/time that works.
              </p>
            ) : (
              <ul className="grid sm:grid-cols-2 gap-3">
                {selectedOptions.map((o) => {
                  const win =
                    o.time_window === "specific" && o.start_time && o.end_time
                      ? `${fmtTime(o.start_time)} – ${fmtTime(o.end_time)}`
                      : o.time_window === "morning"
                      ? "Morning"
                      : o.time_window === "afternoon"
                      ? "Afternoon"
                      : "";
                  return (
                    <li
                      key={o.id}
                      className="rounded-2xl border-2 border-primary/40 bg-primary/5 p-3 flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-primary-deep text-sm">
                          {fmtShortDate(o.date)}
                        </p>
                        {win && <p className="text-xs text-muted-foreground mt-0.5">{win}</p>}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => useSelectedOption(o)}
                        className="rounded-full shrink-0 h-8 text-xs"
                      >
                        Use this time
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {/* Card B — Form */}
        <section className="glass-card p-5 sm:p-6 space-y-4">
          <h2 className="font-display text-xl text-primary-deep flex items-center gap-2">
            <CalendarCheck className="h-5 w-5 text-primary" /> Appointment details
          </h2>

          <div className="rounded-2xl bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
            Client: <span className="text-primary-deep font-medium">{clientName}</span>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                min={req.date_range_start}
                className="rounded-2xl"
              />
              {errors.date && <p className="text-sm text-destructive/80">{errors.date}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="start">Start time</Label>
              <Input
                id="start"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="rounded-2xl"
              />
              {errors.startTime && !errors.date && (
                <p className="text-sm text-destructive/80">{errors.startTime}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="end">
                End time <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                id="end"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="rounded-2xl"
                placeholder={`auto +${lengthMinutes} min`}
              />
              {errors.endTime && <p className="text-sm text-destructive/80">{errors.endTime}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="category" className="rounded-2xl">
                  <SelectValue placeholder="Pick a category" />
                </SelectTrigger>
                <SelectContent>
                  {APPOINTMENT_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.category && <p className="text-sm text-destructive/80">{errors.category}</p>}
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="title">Title / purpose</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="rounded-2xl"
              />
              {errors.title && <p className="text-sm text-destructive/80">{errors.title}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="provider">
                Provider <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                id="provider"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="rounded-2xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="clinic">
                Clinic name <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                id="clinic"
                value={clinic}
                onChange={(e) => setClinic(e.target.value)}
                className="rounded-2xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="practitioner">
                Practitioner <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                id="practitioner"
                value={practitioner}
                onChange={(e) => setPractitioner(e.target.value)}
                className="rounded-2xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">
                Location <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="rounded-2xl"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="mode">Appointment mode</Label>
              <Select value={mode} onValueChange={(v: AppointmentMode) => setMode(v)}>
                <SelectTrigger id="mode" className="rounded-2xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {APPOINTMENT_MODE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="client_notes">
                Notes visible to client <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Textarea
                id="client_notes"
                value={clientVisibleNotes}
                onChange={(e) => setClientVisibleNotes(e.target.value)}
                className="rounded-2xl min-h-[80px]"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="preparation">
                Preparation instructions <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Textarea
                id="preparation"
                value={preparation}
                onChange={(e) => setPreparation(e.target.value)}
                className="rounded-2xl min-h-[60px]"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="bring">
                What to bring <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Textarea
                id="bring"
                value={whatToBring}
                onChange={(e) => setWhatToBring(e.target.value)}
                className="rounded-2xl min-h-[60px]"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="private" className="flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5" /> Private advocate notes{" "}
                <span className="text-muted-foreground font-normal">(only you can see)</span>
              </Label>
              <Textarea
                id="private"
                value={advocatePrivateNotes}
                onChange={(e) => setAdvocatePrivateNotes(e.target.value)}
                className="rounded-2xl min-h-[60px]"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap pt-2">
            <Button onClick={handleSave} disabled={saving} className="rounded-full bg-gradient-ocean shadow-soft gap-1.5">
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Saving…
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" /> Create appointment
                </>
              )}
            </Button>
            <Button
              onClick={() => navigate(`/advocate/availability/${req.id}/review`)}
              variant="ghost"
              className="rounded-full"
            >
              Cancel
            </Button>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function Mini({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-secondary/30 p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm text-primary-deep mt-1 capitalize">{children}</p>
    </div>
  );
}
