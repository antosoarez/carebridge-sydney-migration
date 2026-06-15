import { useEffect, useState } from "react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { CalendarIcon, Loader2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { SameTimeConflictDialog, ExistingAppt, findSameTimeAppt } from "@/components/ocean/SameTimeConflictDialog";

interface ClientOption { id: string; full_name: string | null; email: string; }

export function NewAppointmentDialog({ onCreated }: { onCreated: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientId, setClientId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState<Date | undefined>();
  const [time, setTime] = useState("09:00");
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<ExistingAppt | null>(null);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data: roleRows } = await supabase.from("user_roles").select("user_id").eq("role", "client");
      const ids = (roleRows ?? []).map(r => r.user_id);
      if (!ids.length) { setClients([]); return; }
      const { data: profs } = await supabase.from("profiles").select("id,full_name,email").in("id", ids);
      setClients((profs as ClientOption[]) ?? []);
    })();
  }, [open]);

  const reset = () => {
    setClientId(""); setTitle(""); setLocation(""); setNotes(""); setDate(undefined); setTime("09:00");
    setConflict(null);
  };

  const buildStartsIso = (): string | null => {
    if (!date) return null;
    const [h, m] = time.split(":").map(Number);
    const starts = new Date(date);
    starts.setHours(h || 0, m || 0, 0, 0);
    return starts.toISOString();
  };

  const doInsert = async (startsIso: string) => {
    if (!user) return;
    setSaving(true);
    const isDiscovery = title.trim().toLowerCase() === "free discovery call";
    const { error } = await supabase.from("appointments").insert({
      client_id: clientId,
      title: title.trim(),
      location: location.trim() || null,
      notes: notes.trim() || null,
      starts_at: startsIso,
      created_by: user.id,
      category: isDiscovery ? "free_discovery_call" : null,
    });
    setSaving(false);
    if (error) { toast.error("Couldn't create — try again"); return; }
    toast.success("Appointment added to the shared calendar.");
    reset();
    setConflict(null);
    setOpen(false);
    onCreated();
  };

  const submit = async () => {
    if (!user) return;
    if (!clientId || !title.trim() || !date) {
      toast.error("Please pick a client, a title and a date.");
      return;
    }
    const startsIso = buildStartsIso();
    if (!startsIso) return;

    // Soft nudge: same client + exact starts_at already booked?
    const existing = await findSameTimeAppt(supabase, clientId, startsIso);
    if (existing) {
      setConflict(existing);
      return;
    }
    await doInsert(startsIso);
  };

  const clientLabel = (() => {
    const c = clients.find(c => c.id === clientId);
    return c?.full_name || c?.email || "this client";
  })();

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogTrigger asChild>
          <Button className="rounded-2xl bg-gradient-ocean shadow-soft gap-2">
            <Plus className="h-4 w-4" /> New appointment
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl text-primary-deep">New appointment</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Client</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger><SelectValue placeholder="Pick a client" /></SelectTrigger>
                <SelectContent>
                  {clients.length === 0 && <div className="px-3 py-2 text-sm text-muted-foreground">No clients yet.</div>}
                  {clients.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.full_name || c.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Oncology follow-up" />
              <button
                type="button"
                onClick={() => setTitle("Free discovery call")}
                className="text-xs text-primary underline self-start"
              >
                Use “Free discovery call” preset
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {date ? format(date, "PP") : "Pick date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={date} onSelect={setDate} initialFocus className={cn("p-3 pointer-events-auto")} />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Time</Label>
                <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Location <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Clinic or address" />
            </div>

            <div className="space-y-2">
              <Label>Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything to remember..." rows={3} />
            </div>
          </div>

          <DialogFooter className="mt-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={saving} className="rounded-2xl bg-gradient-ocean shadow-soft gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Add to calendar
            </Button>
          </DialogFooter>
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
          await doInsert(startsIso);
        }}
        onOpenExisting={() => {
          setConflict(null);
          setOpen(false);
          reset();
          navigate("/calendar");
        }}
      />
    </>
  );
}
