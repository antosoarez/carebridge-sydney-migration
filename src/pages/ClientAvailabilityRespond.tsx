import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AppShell } from "@/components/ocean/AppShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";
import { ArrowLeft, Check, Clock, MapPin, Stethoscope, CalendarRange, CheckCircle2, Loader2, Plus, Trash2 } from "lucide-react";
import { fmtShortDate } from "@/lib/availability-store";
import {
  ClientRequestRow,
  OptionRow,
  PreferencesRow,
  addClientOptionRange,
  deleteClientOption,
  emptyPreferences,
  loadOptions,
  loadPreferences,
  loadRequestForClient,
  markWaitingForClient,
  submitResponse,
  toggleOptionSelected,
  upsertPreferences,
} from "@/lib/client-availability-store";

const PREF_FIELDS: Array<{ key: keyof PreferencesRow; label: string }> = [
  { key: "prefers_morning", label: "Mornings are best" },
  { key: "prefers_afternoon", label: "Afternoons are best" },
  { key: "prefers_after_work", label: "After work is best" },
  { key: "prefers_telehealth", label: "Telehealth is easier for me" },
  { key: "needs_transport", label: "I may need help with transport" },
  { key: "needs_interpreter", label: "I may need an interpreter" },
  { key: "cannot_attend_this_week", label: "I cannot attend this week" },
  { key: "needs_help_deciding", label: "I need help deciding" },
  { key: "flexible", label: "I am flexible" },
];

function fmtTime(t: string | null): string {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hh = parseInt(h, 10);
  const mer = hh >= 12 ? "PM" : "AM";
  const h12 = ((hh + 11) % 12) + 1;
  return `${h12}:${m} ${mer}`;
}

function optionDisplay(o: OptionRow): { primary: string; secondary: string } {
  const date = fmtShortDate(o.date);
  if (o.time_window === "specific" && o.start_time && o.end_time) {
    return { primary: o.label || `${date} ${fmtTime(o.start_time)} – ${fmtTime(o.end_time)}`, secondary: `${date} · ${fmtTime(o.start_time)} – ${fmtTime(o.end_time)}` };
  }
  const half = o.time_window === "morning" ? "morning" : o.time_window === "afternoon" ? "afternoon" : "";
  return { primary: o.label || `${date} ${half}`.trim(), secondary: `${date}${half ? ` · ${half}` : ""}` };
}

export default function ClientAvailabilityRespond() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [req, setReq] = useState<ClientRequestRow | null>(null);
  const [options, setOptions] = useState<OptionRow[]>([]);
  const [prefs, setPrefs] = useState<PreferencesRow | null>(null);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefsDirty, setPrefsDirty] = useState(false);
  const [prefsSavedAt, setPrefsSavedAt] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [validation, setValidation] = useState<string | null>(null);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [addingOwn, setAddingOwn] = useState(false);
  const [ownDateFrom, setOwnDateFrom] = useState("");
  const [ownDateTo, setOwnDateTo] = useState("");
  const [ownStart, setOwnStart] = useState("09:00");
  const [ownEnd, setOwnEnd] = useState("12:00");

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = await loadRequestForClient(id);
        if (!r) {
          if (!cancelled) setLoading(false);
          return;
        }
        if (cancelled) return;
        setReq(r);
        const [opts, p] = await Promise.all([loadOptions(id), loadPreferences(id)]);
        if (cancelled) return;
        setOptions(opts);
        setPrefs(p ?? emptyPreferences(id));
        // best-effort status advance
        markWaitingForClient(r).catch(() => {});
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const readOnly = !!req && req.status !== "sent_to_client" && req.status !== "waiting_for_client";

  const selectedOptions = useMemo(() => options.filter((o) => o.selected_by_client), [options]);

  async function handleToggleOption(o: OptionRow) {
    if (readOnly) return;
    const next = !o.selected_by_client;
    // optimistic
    setOptions((prev) => prev.map((x) => (x.id === o.id ? { ...x, selected_by_client: next } : x)));
    try {
      await toggleOptionSelected(o.id, next);
    } catch (e: any) {
      setOptions((prev) => prev.map((x) => (x.id === o.id ? { ...x, selected_by_client: !next } : x)));
      toast({ title: "Couldn't save yet", description: "Please try again.", variant: "destructive" });
    }
  }

  function patchPrefs(patch: Partial<PreferencesRow>) {
    if (!prefs || readOnly) return;
    setPrefs({ ...prefs, ...patch });
    setPrefsDirty(true);
    setPrefsSavedAt(null);
  }

  async function handleSavePrefs() {
    if (!prefs) return;
    setSavingPrefs(true);
    try {
      await upsertPreferences(prefs);
      // reload to capture id on first insert
      const fresh = await loadPreferences(prefs.availability_request_id);
      if (fresh) setPrefs(fresh);
      setPrefsDirty(false);
      setPrefsSavedAt(Date.now());
    } catch (e: any) {
      toast({ title: "Couldn't save yet", description: "Please try again.", variant: "destructive" });
    } finally {
      setSavingPrefs(false);
    }
  }

  async function handleAddOwn() {
    if (!req) return;
    if (!ownDateFrom || !ownStart || !ownEnd) {
      toast({ title: "Please fill in the date frame and times", variant: "destructive" });
      return;
    }
    const dateTo = ownDateTo && ownDateTo >= ownDateFrom ? ownDateTo : ownDateFrom;
    if (ownEnd <= ownStart) {
      toast({ title: "End time must be after start time", variant: "destructive" });
      return;
    }
    setAddingOwn(true);
    try {
      const created = await addClientOptionRange({
        availability_request_id: req.id,
        date_from: ownDateFrom,
        date_to: dateTo,
        start_time: ownStart,
        end_time: ownEnd,
      });
      setOptions((prev) => [...prev, ...created]);
      setOwnDateFrom("");
      setOwnDateTo("");
      setOwnStart("09:00");
      setOwnEnd("12:00");
    } catch (e: any) {
      toast({ title: "Couldn't add window", description: e?.message ?? "Please try again.", variant: "destructive" });
    } finally {
      setAddingOwn(false);
    }
  }

  async function handleRemoveOwn(o: OptionRow) {
    const prev = options;
    setOptions((cur) => cur.filter((x) => x.id !== o.id));
    try {
      await deleteClientOption(o.id);
    } catch (e: any) {
      setOptions(prev);
      toast({ title: "Couldn't remove", description: e?.message ?? "Please try again.", variant: "destructive" });
    }
  }

  async function handleSubmit() {
    if (!req || !prefs) return;
    if (selectedOptions.length === 0) {
      setValidation("Please add or select at least one time you could attend.");
      return;
    }
    setValidation(null);
    setSubmitting(true);
    try {
      if (prefsDirty) {
        await upsertPreferences(prefs);
      }
      await submitResponse(req.id);
      setReq({ ...req, status: "client_responded" });
      setJustSubmitted(true);
    } catch (e: any) {
      toast({ title: "Couldn't submit", description: e?.message ?? "Please try again.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <AppShell role="client" title="Share Your Availability">
        <p className="text-muted-foreground">Loading…</p>
      </AppShell>
    );
  }

  if (!req) {
    return (
      <AppShell role="client" title="Share Your Availability">
        <div className="glass-card p-6 max-w-xl">
          <p className="text-primary-deep">This request isn't available.</p>
          <Link to="/client/availability" className="inline-block mt-4">
            <Button variant="outline" className="rounded-full gap-2"><ArrowLeft className="h-4 w-4" /> Back</Button>
          </Link>
        </div>
      </AppShell>
    );
  }

  // After submit / already responded → confirmation view
  if (justSubmitted || readOnly) {
    return (
      <AppShell role="client" title="Availability shared" subtitle="Thanks — your advocate can now use these times.">
        <div className="glass-card p-6 max-w-2xl space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-success/15 text-success flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="font-display text-lg text-primary-deep">Availability shared</p>
              <p className="text-sm text-muted-foreground">Your advocate can now use these times to help arrange the appointment.</p>
            </div>
          </div>
          {selectedOptions.length > 0 && (
            <div className="pt-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Times you chose</p>
              <ul className="space-y-1.5">
                {selectedOptions.map((o) => {
                  const d = optionDisplay(o);
                  return (
                    <li key={o.id} className="text-sm text-primary-deep flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-success" /> {d.primary}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <div className="pt-2 flex gap-2">
            <Link to="/client"><Button className="rounded-full">Back to dashboard</Button></Link>
            <Link to="/client/availability"><Button variant="outline" className="rounded-full">All requests</Button></Link>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell role="client" title="Share Your Availability" subtitle="Choose the times you could attend. This does not book the appointment yet.">
      <div className="max-w-3xl space-y-6 pb-32">
        <Link to="/client/availability" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary-deep transition-calm">
          <ArrowLeft className="h-4 w-4" /> Back to requests
        </Link>

        {/* A. Context */}
        <section className="glass-card p-5 sm:p-6 space-y-3">
          <h2 className="font-display text-lg text-primary-deep">What is this for?</h2>
          <p className="text-sm text-muted-foreground">This does not book the appointment yet. These are the times your advocate can use when contacting the clinic.</p>
          <div className="grid sm:grid-cols-2 gap-3 pt-2">
            <Info icon={<Stethoscope className="h-4 w-4" />} label="Appointment">
              {req.appointment_category.replace(/_/g, " ")}{req.appointment_purpose ? ` — ${req.appointment_purpose}` : ""}
            </Info>
            {(req.provider_name || req.clinic_name) && (
              <Info icon={<Stethoscope className="h-4 w-4" />} label="Provider">
                {[req.provider_name, req.clinic_name].filter(Boolean).join(" · ")}
              </Info>
            )}
            {req.location && (
              <Info icon={<MapPin className="h-4 w-4" />} label="Location">{req.location}</Info>
            )}
            <Info icon={<CalendarRange className="h-4 w-4" />} label="Date range">
              {fmtShortDate(req.date_range_start)} → {fmtShortDate(req.date_range_end)}
            </Info>
            {req.preferred_appointment_length_minutes && (
              <Info icon={<Clock className="h-4 w-4" />} label="Length">{req.preferred_appointment_length_minutes} min</Info>
            )}
          </div>
          {req.client_facing_notes && (
            <div className="mt-3 rounded-2xl bg-secondary/40 p-3 text-sm text-primary-deep whitespace-pre-wrap">
              {req.client_facing_notes}
            </div>
          )}
        </section>

        {/* B. Options */}
        <section className="glass-card p-5 sm:p-6 space-y-3">
          <h2 className="font-display text-lg text-primary-deep">Choose times you could attend</h2>
          <p className="text-sm text-muted-foreground">
            {options.length === 0
              ? "Add the date and time windows when you could attend."
              : "Tick every time you could possibly attend. You can also add your own below."}
          </p>
          {options.length > 0 && (
            <div className="grid sm:grid-cols-2 gap-3 pt-2">
              {options.map((o) => {
                const d = optionDisplay(o);
                const selected = o.selected_by_client;
                const clientAdded = o.label === "Client suggested";
                return (
                  <div
                    key={o.id}
                    className={`relative rounded-2xl border-2 transition-calm ${
                      selected ? "bg-primary/10 border-primary shadow-soft" : "bg-card border-border hover:border-primary/40 hover:bg-secondary/40"
                    }`}
                  >
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={selected}
                      aria-pressed={selected}
                      onClick={() => handleToggleOption(o)}
                      className="w-full text-left p-4 min-h-[72px] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-2xl"
                    >
                      <div className="flex items-start gap-3 pr-8">
                        <div
                          aria-hidden
                          className={`h-6 w-6 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                            selected ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/40"
                          }`}
                        >
                          {selected && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-primary-deep">{d.primary}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{d.secondary}</p>
                          {clientAdded && <p className="text-xs text-muted-foreground mt-1 italic">Added by you</p>}
                        </div>
                      </div>
                    </button>
                    {clientAdded && !readOnly && (
                      <button
                        type="button"
                        aria-label="Remove window"
                        onClick={() => handleRemoveOwn(o)}
                        className="absolute top-2 right-2 h-8 w-8 rounded-full text-muted-foreground hover:text-status-overdue hover:bg-secondary/60 flex items-center justify-center transition-calm"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {!readOnly && (
            <div className="rounded-2xl bg-secondary/40 p-4 space-y-3 mt-2">
              <p className="text-sm font-medium text-primary-deep">Add your own window</p>
              <p className="text-xs text-muted-foreground">Pick a date frame and the time of day that would work best across those days.</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">From date</Label>
                  <Input
                    type="date"
                    value={ownDateFrom}
                    min={req.date_range_start}
                    max={req.date_range_end}
                    onChange={(e) => {
                      const next = e.target.value;
                      setOwnDateFrom(next);
                      if (!ownDateTo || ownDateTo < next) setOwnDateTo(next);
                    }}
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">To date</Label>
                  <Input
                    type="date"
                    value={ownDateTo || ownDateFrom}
                    min={ownDateFrom || req.date_range_start}
                    max={req.date_range_end}
                    onChange={(e) => setOwnDateTo(e.target.value)}
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Best from</Label>
                  <Input type="time" value={ownStart} onChange={(e) => setOwnStart(e.target.value)} className="rounded-xl" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Until</Label>
                  <Input type="time" value={ownEnd} onChange={(e) => setOwnEnd(e.target.value)} className="rounded-xl" />
                </div>
              </div>
              <Button type="button" variant="outline" onClick={handleAddOwn} disabled={addingOwn} className="rounded-full">
                {addingOwn ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Adding…</> : <><Plus className="h-4 w-4 mr-1.5" /> Add window</>}
              </Button>
            </div>
          )}
        </section>


        {/* C. Preferences */}
        <section className="glass-card p-5 sm:p-6 space-y-3">
          <h2 className="font-display text-lg text-primary-deep">Anything we should know?</h2>
          <p className="text-sm text-muted-foreground">Optional — but helpful for your advocate.</p>
          <div className="grid sm:grid-cols-2 gap-2 pt-2">
            {PREF_FIELDS.map((f) => {
              const checked = !!prefs?.[f.key];
              return (
                <label
                  key={f.key as string}
                  className={`flex items-center gap-3 rounded-2xl border-2 p-3 cursor-pointer transition-calm min-h-[56px] ${
                    checked ? "bg-accent/10 border-accent" : "bg-card border-border hover:bg-secondary/40"
                  }`}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) => patchPrefs({ [f.key]: !!v } as Partial<PreferencesRow>)}
                    className="h-5 w-5"
                  />
                  <span className="text-sm font-medium text-primary-deep">{f.label}</span>
                </label>
              );
            })}
          </div>
          <div className="pt-3">
            <label htmlFor="client_notes" className="text-sm font-medium text-primary-deep">
              Anything else your advocate should know?
            </label>
            <Textarea
              id="client_notes"
              value={prefs?.client_notes ?? ""}
              onChange={(e) => patchPrefs({ client_notes: e.target.value })}
              placeholder="Example: I prefer Tuesdays, I need school pickup time, or I get anxious with early mornings."
              className="mt-2 rounded-2xl min-h-[100px]"
            />
          </div>
          <div className="flex items-center gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={handleSavePrefs}
              disabled={savingPrefs || !prefsDirty}
            >
              {savingPrefs ? (<><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Saving…</>) : "Save preferences"}
            </Button>
            {!prefsDirty && prefsSavedAt && (
              <span className="text-xs text-success flex items-center gap-1"><Check className="h-3.5 w-3.5" /> Saved</span>
            )}
            {prefsDirty && (
              <span className="text-xs text-muted-foreground">Unsaved changes</span>
            )}
          </div>
        </section>
      </div>

      {/* Sticky submit */}
      <div className="fixed bottom-0 inset-x-0 z-20 bg-background/90 backdrop-blur-xl border-t border-border px-5 py-3 md:left-64">
        <div className="max-w-3xl mx-auto flex items-center gap-3 flex-wrap">
          {validation && (
            <p className="text-sm text-primary-deep bg-accent/15 rounded-2xl px-3 py-2 flex-1 min-w-[200px]">{validation}</p>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Link to="/client/availability"><Button variant="ghost" className="rounded-full">Back</Button></Link>
            <Button onClick={handleSubmit} disabled={submitting} className="rounded-full px-6">
              {submitting ? (<><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Sharing…</>) : "Share availability"}
            </Button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Info({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-secondary/30 p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
        <span className="text-primary/70">{icon}</span> {label}
      </p>
      <p className="text-sm text-primary-deep mt-1">{children}</p>
    </div>
  );
}
