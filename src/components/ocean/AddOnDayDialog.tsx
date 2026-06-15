import { useEffect, useState } from "react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { Loader2, CalendarPlus, ListTodo } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { SameTimeConflictDialog, ExistingAppt, findSameTimeAppt } from "@/components/ocean/SameTimeConflictDialog";

interface ClientOption { id: string; full_name: string | null; email: string; }

export const APPOINTMENT_TYPES = [
  "Blood Test", "Urine Test", "Stool Test", "ECG", "Echocardiogram",
  "Holter Monitor", "Blood Pressure Check", "Ultrasound", "X-Ray", "CT Scan",
  "MRI", "Mammogram", "Pap Smear / Cervical Screening", "STI Screening",
  "Bowel Cancer Screening", "Skin Check", "Mole Mapping", "Eye Test",
  "Hearing Test", "Lung Function Test / Spirometry", "Sleep Study",
  "Bone Density Scan / DEXA", "Allergy Test", "Mental Health Screening",
  "ADHD Screening", "Autism Assessment", "Cognitive / Memory Assessment",
  "Cardiology Assessment", "Psychiatry Assessment", "Specialist Referral",
  "GP Appointment",
] as const;

// Types where a body area / focus matters
const NEEDS_DETAIL = new Set<string>([
  "Ultrasound", "X-Ray", "CT Scan", "MRI", "Specialist Referral",
]);

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  date: Date | null;
  onCreated: () => void;
  /** "advocate" (default) shows a client picker. "client" books for the signed-in client only. */
  mode?: "advocate" | "client";
  /** When mode === "client", clients can't create tasks for themselves here. */
}

export function AddOnDayDialog({ open, onOpenChange, date, onCreated, mode = "advocate" }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isClient = mode === "client";
  const [tab, setTab] = useState<"appointment" | "task">("appointment");
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientId, setClientId] = useState("");
  const [apptType, setApptType] = useState<string>("");
  const [detail, setDetail] = useState("");
  const [otherType, setOtherType] = useState("");
  const [time, setTime] = useState("09:00");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  // task
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDesc, setTaskDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<ExistingAppt | null>(null);

  useEffect(() => {
    if (!open) return;
    if (isClient) {
      if (user?.id) setClientId(user.id);
      return;
    }
    (async () => {
      const { data: roleRows } = await supabase.from("user_roles").select("user_id").eq("role", "client");
      const ids = (roleRows ?? []).map(r => r.user_id);
      if (!ids.length) { setClients([]); return; }
      const { data: profs } = await supabase.from("profiles").select("id,full_name,email").in("id", ids);
      setClients((profs as ClientOption[]) ?? []);
    })();
  }, [open, isClient, user?.id]);

  const reset = () => {
    setTab("appointment");
    setClientId(isClient && user?.id ? user.id : "");
    setApptType(""); setDetail("");
    setOtherType(""); setTime("09:00"); setLocation(""); setNotes("");
    setTaskTitle(""); setTaskDesc("");
  };

  const close = (o: boolean) => { onOpenChange(o); if (!o) reset(); };

  const submitAppointment = async () => {
    if (!user || !date) return;
    if (!clientId) return toast.error("Please pick a client.");
    if (!apptType) return toast.error("Please pick a type.");
    if (apptType === "Other" && !otherType.trim()) return toast.error("Please type the appointment type.");
    if (NEEDS_DETAIL.has(apptType) && !detail.trim()) return toast.error("Please add a short detail (e.g. body area).");

    const startsIso = buildStartsIso();
    if (!startsIso) return;

    const existing = await findSameTimeAppt(supabase, clientId, startsIso);
    if (existing) { setConflict(existing); return; }
    await doInsertAppointment(startsIso);
  };

  const buildStartsIso = (): string | null => {
    if (!date) return null;
    const [h, m] = time.split(":").map(Number);
    const starts = new Date(date);
    starts.setHours(h || 0, m || 0, 0, 0);
    return starts.toISOString();
  };

  const doInsertAppointment = async (startsIso: string) => {
    if (!user) return;
    const baseType = apptType === "Other" ? otherType.trim() : apptType;
    const title = NEEDS_DETAIL.has(apptType) && detail.trim()
      ? `${baseType} — ${detail.trim()}`
      : baseType;

    setSaving(true);
    const { error } = await supabase.from("appointments").insert({
      client_id: clientId,
      title,
      location: location.trim() || null,
      notes: notes.trim() || null,
      starts_at: startsIso,
      created_by: user.id,
    });
    setSaving(false);
    if (error) return toast.error("Couldn't save — try again");
    toast.success("Appointment added to the calendar.");
    setConflict(null);
    onCreated();
    close(false);
  };

  const submitTask = async () => {
    if (!user || !date) return;
    if (!clientId) return toast.error("Please pick a client.");
    if (!taskTitle.trim()) return toast.error("Please add a task title.");
    setSaving(true);
    const due = format(date, "yyyy-MM-dd");
    const { error } = await supabase.from("tasks").insert({
      client_id: clientId,
      title: taskTitle.trim(),
      description: taskDesc.trim() || null,
      due_date: due,
      created_by: user.id,
    });
    setSaving(false);
    if (error) return toast.error("Couldn't save — try again");
    toast.success("Task added.");
    onCreated();
    close(false);
  };

  const showDetail = NEEDS_DETAIL.has(apptType);
  const showOther = apptType === "Other";

  const clientLabel = (() => {
    if (isClient) return "you";
    const c = clients.find(c => c.id === clientId);
    return c?.full_name || c?.email || "this client";
  })();

  return (
    <>
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md rounded-3xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl text-primary-deep">
            Add to {date ? format(date, "EEEE, MMM d") : "day"}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "appointment" | "task")} className="pt-1">
          {!isClient && (
            <TabsList className="grid grid-cols-2 rounded-2xl bg-secondary/60 p-1 h-auto">
              <TabsTrigger value="appointment" className="rounded-xl gap-2 py-2.5">
                <CalendarPlus className="h-4 w-4" /> Appointment
              </TabsTrigger>
              <TabsTrigger value="task" className="rounded-xl gap-2 py-2.5">
                <ListTodo className="h-4 w-4" /> Task
              </TabsTrigger>
            </TabsList>
          )}

          <TabsContent value="appointment" className="space-y-4 pt-4">
            {!isClient && (
              <div className="space-y-2">
                <Label>Client</Label>
                <Select value={clientId} onValueChange={setClientId}>
                  <SelectTrigger className="rounded-xl"><SelectValue placeholder="Pick a client" /></SelectTrigger>
                  <SelectContent>
                    {clients.length === 0 && <div className="px-3 py-2 text-sm text-muted-foreground">No clients yet.</div>}
                    {clients.map(c => (<SelectItem key={c.id} value={c.id}>{c.full_name || c.email}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={apptType} onValueChange={(v) => { setApptType(v); if (!NEEDS_DETAIL.has(v)) setDetail(""); if (v !== "Other") setOtherType(""); }}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Pick a type" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {APPOINTMENT_TYPES.map(t => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
                  <SelectItem value="Other">Other…</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {showOther && (
              <div className="space-y-2">
                <Label>Custom type</Label>
                <Input className="rounded-xl" value={otherType} onChange={(e) => setOtherType(e.target.value)} placeholder="Type the appointment type" />
              </div>
            )}

            {showDetail && (
              <div className="space-y-2">
                <Label>Details <span className="text-muted-foreground text-xs">(of what?)</span></Label>
                <Input className="rounded-xl" value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="e.g. abdominal, lumbar spine, rheumatology" />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Time</Label>
                <Input type="time" className="rounded-xl" value={time} onChange={(e) => setTime(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Location <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input className="rounded-xl" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Clinic or address" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Textarea className="rounded-xl" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Anything to remember…" />
            </div>

            <DialogFooter className="pt-2 gap-2">
              <Button variant="ghost" onClick={() => close(false)} className="rounded-2xl">Cancel</Button>
              <Button onClick={submitAppointment} disabled={saving} className="rounded-2xl bg-gradient-ocean shadow-soft gap-2">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} Add appointment
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="task" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Client</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Pick a client" /></SelectTrigger>
                <SelectContent>
                  {clients.length === 0 && <div className="px-3 py-2 text-sm text-muted-foreground">No clients yet.</div>}
                  {clients.map(c => (<SelectItem key={c.id} value={c.id}>{c.full_name || c.email}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Task title</Label>
              <Input className="rounded-xl" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="e.g. Call clinic to confirm" />
            </div>

            <div className="space-y-2">
              <Label>Description <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Textarea className="rounded-xl" value={taskDesc} onChange={(e) => setTaskDesc(e.target.value)} rows={3} placeholder="Anything to remember…" />
            </div>

            <DialogFooter className="pt-2 gap-2">
              <Button variant="ghost" onClick={() => close(false)} className="rounded-2xl">Cancel</Button>
              <Button onClick={submitTask} disabled={saving} className="rounded-2xl bg-gradient-ocean shadow-soft gap-2">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} Add task
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
    <SameTimeConflictDialog
      open={!!conflict}
      onOpenChange={(o) => { if (!o) setConflict(null); }}
      existing={conflict}
      clientLabel={clientLabel}
      saving={saving}
      onConfirmSeparate={async () => {
        const startsIso = buildStartsIso();
        if (!startsIso) return;
        await doInsertAppointment(startsIso);
      }}
      onOpenExisting={() => {
        setConflict(null);
        close(false);
        navigate("/calendar");
      }}
    />
    </>
  );
}
