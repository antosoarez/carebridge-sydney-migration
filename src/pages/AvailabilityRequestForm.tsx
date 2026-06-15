import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams, Link } from "react-router-dom";
import { AppShell } from "@/components/ocean/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useClients } from "@/lib/clients-store";
import { toast } from "@/components/ui/use-toast";
import { ArrowLeft, Lock, Plus, Trash2 } from "lucide-react";
import {
  APPOINTMENT_CATEGORIES,
  APPT_LENGTH_OPTIONS,
  AvailabilityStatus,
  DraftOption,
  URGENCY_OPTIONS,
  expandDateRange,
  newTempId,
} from "@/lib/availability-store";

const DEFAULT_CLIENT_MSG =
  "Please choose the times you could attend an appointment. You do not need to call the clinic yourself — I'll use your availability to help arrange the appointment for you.";

type YesNo = "yes" | "no";
const yn = (b: boolean): YesNo => (b ? "yes" : "no");

function SegYesNo({ value, onChange, name }: { value: boolean; onChange: (v: boolean) => void; name: string }) {
  return (
    <div role="radiogroup" aria-label={name} className="inline-flex rounded-full bg-secondary/60 p-1">
      {(["yes", "no"] as YesNo[]).map((opt) => {
        const active = yn(value) === opt;
        return (
          <button
            key={opt}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt === "yes")}
            className={`px-4 py-1.5 text-sm rounded-full transition-calm capitalize ${
              active ? "bg-white text-primary-deep shadow-sm" : "text-muted-foreground hover:text-primary-deep"
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

export default function AvailabilityRequestForm() {
  const { id } = useParams<{ id: string }>();
  const [search] = useSearchParams();
  const prefillClient = search.get("client");
  const navigate = useNavigate();
  const { user } = useAuth();
  const { clients } = useClients();

  const isEdit = !!id;
  const [loading, setLoading] = useState(isEdit);
  const [status, setStatus] = useState<AvailabilityStatus>("draft");
  const [clientId, setClientId] = useState<string>(prefillClient ?? "");
  const [category, setCategory] = useState<string>("GP");
  const [purpose, setPurpose] = useState("");
  const [providerName, setProviderName] = useState("");
  const [clinicName, setClinicName] = useState("");
  const [location, setLocation] = useState("");
  const [urgency, setUrgency] = useState<"flexible" | "soon" | "important">("flexible");
  const [length, setLength] = useState<string>("");
  const [telehealth, setTelehealth] = useState(true);
  const [inPerson, setInPerson] = useState(false);
  const [interpreter, setInterpreter] = useState(false);
  const [transport, setTransport] = useState("");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [options, setOptions] = useState<DraftOption[]>([]);
  const [clientMsg, setClientMsg] = useState(DEFAULT_CLIENT_MSG);
  const [advocateNotes, setAdvocateNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Load existing record
  useEffect(() => {
    if (!isEdit || !id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: req, error } = await supabase
        .from("availability_requests")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error || !req) {
        if (!cancelled) {
          toast({ title: "Couldn't load request", description: error?.message ?? "Not found", variant: "destructive" });
          navigate("/advocate/availability");
        }
        return;
      }
      // Private notes via security-definer RPC
      const { data: notes } = await supabase.rpc("get_advocate_notes", { _request_id: id });
      const { data: opts } = await supabase
        .from("availability_options")
        .select("*")
        .eq("availability_request_id", id)
        .order("date", { ascending: true });
      if (cancelled) return;
      setStatus(req.status as AvailabilityStatus);
      setClientId(req.client_id);
      setCategory(req.appointment_category);
      setPurpose(req.appointment_purpose ?? "");
      setProviderName(req.provider_name ?? "");
      setClinicName(req.clinic_name ?? "");
      setLocation(req.location ?? "");
      setUrgency(req.urgency as any);
      setLength(req.preferred_appointment_length_minutes ? String(req.preferred_appointment_length_minutes) : "");
      setTelehealth(req.telehealth_acceptable);
      setInPerson(req.in_person_required);
      setInterpreter(req.interpreter_needed);
      setTransport(req.transport_considerations ?? "");
      setRangeStart(req.date_range_start);
      setRangeEnd(req.date_range_end);
      setClientMsg(req.client_facing_notes ?? DEFAULT_CLIENT_MSG);
      setAdvocateNotes((notes as string | null) ?? "");
      setOptions(
        (opts ?? []).map((o: any) => ({
          tempId: o.id,
          date: o.date,
          date_to: o.date,
          time_window: o.time_window,
          start_time: o.start_time,
          end_time: o.end_time,
          label: o.label,
        })),
      );
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id, isEdit, navigate]);

  const selectedClient = useMemo(() => clients.find((c) => c.id === clientId), [clients, clientId]);

  function addCustomOption() {
    const start = rangeStart || new Date().toISOString().slice(0, 10);
    setOptions((prev) => [
      ...prev,
      {
        tempId: newTempId(),
        date: start,
        date_to: rangeEnd && rangeEnd >= start ? rangeEnd : start,
        time_window: "specific",
        start_time: "09:00",
        end_time: "12:00",
        label: "Custom window",
      },
    ]);
  }

  function updateOption(tempId: string, patch: Partial<DraftOption>) {
    setOptions((prev) => prev.map((o) => (o.tempId === tempId ? { ...o, ...patch } : o)));
  }
  function removeOption(tempId: string) {
    setOptions((prev) => prev.filter((o) => o.tempId !== tempId));
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!clientId) e.clientId = "Please choose a client.";
    if (!category) e.category = "Please choose an appointment category.";
    if (!purpose.trim()) e.purpose = "Please add the appointment purpose.";
    if (!rangeStart) e.rangeStart = "Please add a start date.";
    if (!rangeEnd) e.rangeEnd = "Please add an end date.";
    if (rangeStart && rangeEnd && rangeEnd < rangeStart) e.rangeEnd = "End date can't be before start date.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function persist(targetStatus: "draft" | "sent_to_client") {
    if (!validate()) {
      toast({ title: "A few small things to check", description: "We've highlighted what to update.", variant: "destructive" });
      return;
    }
    if (!user?.id) return;
    setSaving(true);

    const payload = {
      client_id: clientId,
      advocate_id: user.id, // RLS check requires this; trigger also sets it server-side
      appointment_category: category,
      appointment_purpose: purpose.trim(),
      provider_name: providerName.trim() || null,
      clinic_name: clinicName.trim() || null,
      location: location.trim() || null,
      date_range_start: rangeStart,
      date_range_end: rangeEnd,
      urgency,
      preferred_appointment_length_minutes: length ? Number(length) : null,
      telehealth_acceptable: telehealth,
      in_person_required: inPerson,
      interpreter_needed: interpreter,
      transport_considerations: transport.trim() || null,
      advocate_notes: advocateNotes.trim() || null,
      client_facing_notes: clientMsg.trim() || null,
    };

    let requestId = id ?? "";
    if (isEdit && id) {
      const { error } = await supabase.from("availability_requests").update(payload).eq("id", id);
      if (error) { setSaving(false); toast({ title: "Couldn't save", description: error.message, variant: "destructive" }); return; }
    } else {
      const { data, error } = await supabase
        .from("availability_requests")
        .insert({ ...payload, status: "draft" })
        .select("id")
        .single();
      if (error || !data) { setSaving(false); toast({ title: "Couldn't save", description: error?.message ?? "", variant: "destructive" }); return; }
      requestId = data.id;
    }

    // Replace options. Expand each draft window across its date frame, one row per day.
    await supabase.from("availability_options").delete().eq("availability_request_id", requestId);
    if (options.length > 0) {
      const rows = options.flatMap((o) => {
        const days = expandDateRange(o.date, o.date_to || o.date);
        return days.map((d) => ({
          availability_request_id: requestId,
          date: d,
          time_window: o.time_window,
          start_time: o.start_time,
          end_time: o.end_time,
          label: o.label,
        }));
      });
      if (rows.length > 0) {
        const { error: optErr } = await supabase.from("availability_options").insert(rows);
        if (optErr) { setSaving(false); toast({ title: "Saved, but windows didn't save", description: optErr.message, variant: "destructive" }); return; }
      }
    }

    // Promote to sent_to_client if requested (status guard trigger only allows draft → sent_to_client)
    if (targetStatus === "sent_to_client" && status === "draft") {
      const { error: stErr } = await supabase
        .from("availability_requests")
        .update({ status: "sent_to_client" })
        .eq("id", requestId);
      if (stErr) { setSaving(false); toast({ title: "Couldn't send to client", description: stErr.message, variant: "destructive" }); return; }
      toast({ title: "Request saved.", description: "Client delivery will be connected in a later step." });
    } else {
      toast({ title: "Availability request saved." });
    }

    setSaving(false);
    navigate("/advocate/availability");
  }

  if (loading) {
    return <AppShell role="advocate"><div className="text-muted-foreground">Loading…</div></AppShell>;
  }

  const canSaveDraft = status === "draft";
  const canSend = status === "draft";

  return (
    <AppShell
      role="advocate"
      seoTitle="Request Availability"
      title="Request Availability"
      subtitle="Ask a client when they could attend an appointment, without needing to call back and forth."
    >
      <Link to="/advocate/availability" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary mb-6">
        <ArrowLeft className="h-4 w-4" /> All availability requests
      </Link>

      <div className="glass-card p-5 sm:p-6 mb-6 bg-gradient-card">
        <p className="text-sm text-primary-deep/80">
          This does not book the appointment yet. The client is only sharing when they could attend. You'll use this information when contacting the clinic.
        </p>
      </div>

      <div className="space-y-6 max-w-3xl">
        {/* Section 1 — Client */}
        <section className="glass-card p-5 sm:p-6 space-y-4">
          <div>
            <h2 className="font-display text-xl text-primary-deep">Who is this for?</h2>
            <p className="text-sm text-muted-foreground mt-1">Pick the client this request is about.</p>
          </div>
          {clients.length === 0 ? (
            <p className="text-sm text-muted-foreground rounded-2xl bg-secondary/40 p-4">
              No clients available yet. Add a client before creating an availability request.
            </p>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="client">Client</Label>
              <Select value={clientId} onValueChange={setClientId} disabled={isEdit}>
                <SelectTrigger id="client" className="rounded-2xl"><SelectValue placeholder="Choose a client" /></SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name} — {c.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedClient && (
                <p className="text-xs text-muted-foreground">Selected: {selectedClient.name} · {selectedClient.email}</p>
              )}
              {errors.clientId && <p className="text-sm text-status-overdue">{errors.clientId}</p>}
            </div>
          )}
        </section>

        {/* Section 2 — Purpose */}
        <section className="glass-card p-5 sm:p-6 space-y-4">
          <div>
            <h2 className="font-display text-xl text-primary-deep">What kind of appointment?</h2>
            <p className="text-sm text-muted-foreground mt-1">Give the basics — keep it short.</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="category" className="rounded-2xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {APPOINTMENT_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {errors.category && <p className="text-sm text-status-overdue">{errors.category}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="urgency">Urgency</Label>
              <Select value={urgency} onValueChange={(v: any) => setUrgency(v)}>
                <SelectTrigger id="urgency" className="rounded-2xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {URGENCY_OPTIONS.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="purpose">Purpose</Label>
              <Input id="purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. Repeat script + bloods" className="rounded-2xl" />
              {errors.purpose && <p className="text-sm text-status-overdue">{errors.purpose}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="provider">Provider name <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input id="provider" value={providerName} onChange={(e) => setProviderName(e.target.value)} className="rounded-2xl" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="clinic">Clinic name <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input id="clinic" value={clinicName} onChange={(e) => setClinicName(e.target.value)} className="rounded-2xl" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">Location <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} className="rounded-2xl" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="length">Appointment length</Label>
              <Select value={length || "_unknown"} onValueChange={(v) => setLength(v === "_unknown" ? "" : v)}>
                <SelectTrigger id="length" className="rounded-2xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {APPT_LENGTH_OPTIONS.map((o) => <SelectItem key={o.value || "_unknown"} value={o.value || "_unknown"}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        {/* Section 3 — Preferences */}
        <section className="glass-card p-5 sm:p-6 space-y-4">
          <div>
            <h2 className="font-display text-xl text-primary-deep">Preferences</h2>
            <p className="text-sm text-muted-foreground mt-1">A few accessibility and format notes.</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="flex items-center justify-between rounded-2xl bg-secondary/40 px-4 py-3">
              <Label>Telehealth acceptable</Label>
              <SegYesNo value={telehealth} onChange={setTelehealth} name="telehealth" />
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-secondary/40 px-4 py-3">
              <Label>In-person required</Label>
              <SegYesNo value={inPerson} onChange={setInPerson} name="in-person" />
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-secondary/40 px-4 py-3">
              <Label>Interpreter needed</Label>
              <SegYesNo value={interpreter} onChange={setInterpreter} name="interpreter" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="transport">Transport considerations <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea id="transport" rows={2} value={transport} onChange={(e) => setTransport(e.target.value)} placeholder="e.g. No car — needs to be near a train line" className="rounded-2xl" />
            </div>
          </div>
        </section>

        {/* Section 4 — Date range */}
        <section className="glass-card p-5 sm:p-6 space-y-4">
          <div>
            <h2 className="font-display text-xl text-primary-deep">Date range</h2>
            <p className="text-sm text-muted-foreground mt-1">The window the client should choose times within.</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start">From</Label>
              <Input id="start" type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} className="rounded-2xl" />
              {errors.rangeStart && <p className="text-sm text-status-overdue">{errors.rangeStart}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="end">To</Label>
              <Input id="end" type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} className="rounded-2xl" />
              {errors.rangeEnd && <p className="text-sm text-status-overdue">{errors.rangeEnd}</p>}
            </div>
          </div>
        </section>

        {/* Section 5 — Time windows (optional for advocate) */}
        <section className="glass-card p-5 sm:p-6 space-y-4">
          <div>
            <h2 className="font-display text-xl text-primary-deep">Suggested time windows <span className="text-sm font-normal text-muted-foreground">(optional)</span></h2>
            <p className="text-sm text-muted-foreground mt-1">Add one or more date and time windows the client could choose from. You can also leave this empty and let the client propose their own.</p>
          </div>

          {options.length > 0 && (
            <ul className="space-y-2">
              {options.map((o) => (
                <li key={o.tempId} className="rounded-2xl bg-secondary/40 p-3 sm:p-4">
                  <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-start">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">From date</Label>
                        <Input
                          aria-label="From date"
                          type="date"
                          value={o.date}
                          onChange={(e) => {
                            const next = e.target.value;
                            updateOption(o.tempId, {
                              date: next,
                              date_to: o.date_to && o.date_to >= next ? o.date_to : next,
                            });
                          }}
                          className="rounded-xl"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">To date</Label>
                        <Input
                          aria-label="To date"
                          type="date"
                          value={o.date_to || o.date}
                          min={o.date}
                          onChange={(e) => updateOption(o.tempId, { date_to: e.target.value })}
                          className="rounded-xl"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">From time</Label>
                        <Input
                          aria-label="From time"
                          type="time"
                          value={o.start_time ?? ""}
                          onChange={(e) => updateOption(o.tempId, { start_time: e.target.value || null })}
                          className="rounded-xl"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">To time</Label>
                        <Input
                          aria-label="To time"
                          type="time"
                          value={o.end_time ?? ""}
                          onChange={(e) => updateOption(o.tempId, { end_time: e.target.value || null })}
                          className="rounded-xl"
                        />
                      </div>
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeOption(o.tempId)} className="rounded-full text-muted-foreground hover:text-status-overdue self-start">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}


          <Button type="button" variant="outline" onClick={addCustomOption} className="rounded-full">
            <Plus className="h-4 w-4 mr-1" /> Add custom window
          </Button>

          {errors.options && <p className="text-sm text-status-overdue">{errors.options}</p>}
        </section>

        {/* Section 6 — Client message */}
        <section className="glass-card p-5 sm:p-6 space-y-3">
          <div>
            <h2 className="font-display text-xl text-primary-deep">Message to client</h2>
            <p className="text-sm text-muted-foreground mt-1">What the client will see alongside the time options.</p>
          </div>
          <Textarea rows={4} value={clientMsg} onChange={(e) => setClientMsg(e.target.value)} className="rounded-2xl" />
        </section>

        {/* Section 7 — Private notes */}
        <section className="glass-card p-5 sm:p-6 space-y-3">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-display text-xl text-primary-deep">Internal notes</h2>
            <span className="text-xs rounded-full bg-secondary/60 px-2.5 py-0.5 text-muted-foreground">Only you can see this</span>
          </div>
          <Textarea
            rows={3}
            value={advocateNotes}
            onChange={(e) => setAdvocateNotes(e.target.value)}
            placeholder="Clinic may require authority form. Check if advocate involvement is accepted."
            className="rounded-2xl"
          />
        </section>

        {/* Footer actions */}
        <div className="sticky bottom-4 z-10">
          <div className="glass-card p-3 sm:p-4 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-end">
            <Button type="button" variant="ghost" onClick={() => navigate(-1)} className="rounded-full">Cancel</Button>
            {canSaveDraft && (
              <Button type="button" variant="outline" onClick={() => persist("draft")} disabled={saving} className="rounded-full">
                Save draft
              </Button>
            )}
            {canSend ? (
              <Button type="button" onClick={() => persist("sent_to_client")} disabled={saving} className="rounded-full">
                Send to client
              </Button>
            ) : (
              <Button type="button" onClick={() => persist("draft")} disabled={saving} className="rounded-full">
                Save changes
              </Button>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
