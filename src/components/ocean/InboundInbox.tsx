import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/components/ui/use-toast";
import { Inbox, ExternalLink, Plus, UserPlus, Loader2, Save, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/brain-dump-store";

// --- Pipeline values (must match the inbound_messages.enquiry_status CHECK) ---
const STATUSES = [
  "New",
  "Reviewed",
  "Replied",
  "Discovery call offered",
  "Discovery call booked",
  "Invite sent",
  "Converted to client",
  "Not suitable",
  "No response",
  "Archived",
] as const;

type EnquiryStatus = typeof STATUSES[number];

const SOURCES = [
  "website_form",
  "manual",
  "calendly",
  "email",
  "referral",
  "in_app_contact",
] as const;

type EnquirySource = typeof SOURCES[number];

const SOURCE_LABEL: Record<EnquirySource, string> = {
  website_form: "Website",
  manual: "Manual",
  calendly: "Calendly",
  email: "Email",
  referral: "Referral",
  in_app_contact: "In-app",
};

type InboundMessage = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  subject: string | null;
  message: string;
  status: "new" | "read" | "archived";
  enquiry_status: EnquiryStatus;
  source: EnquirySource | null;
  preferred_contact: string | null;
  service_interest: string | null;
  internal_notes: string | null;
  converted_client_id: string | null;
  created_at: string;
};

// Quick filter tabs — these GROUP the pipeline values
type TabKey = "new" | "reviewed" | "replied" | "discovery" | "invite_sent" | "converted" | "archived" | "all";

const TAB_FILTERS: Record<TabKey, EnquiryStatus[] | null> = {
  new: ["New"],
  reviewed: ["Reviewed"],
  replied: ["Replied"],
  discovery: ["Discovery call offered", "Discovery call booked"],
  invite_sent: ["Invite sent"],
  converted: ["Converted to client"],
  archived: ["Archived", "Not suitable", "No response"],
  all: null,
};

const TAB_LABELS: { key: TabKey; label: string }[] = [
  { key: "new", label: "New" },
  { key: "reviewed", label: "Reviewed" },
  { key: "replied", label: "Replied" },
  { key: "discovery", label: "Discovery" },
  { key: "invite_sent", label: "Invite sent" },
  { key: "converted", label: "Converted" },
  { key: "archived", label: "Closed" },
  { key: "all", label: "All" },
];

export function InboundInbox({ focusEnquiryId }: { focusEnquiryId?: string | null } = {}) {
  const [tab, setTab] = useState<TabKey>("new");
  const [rows, setRows] = useState<InboundMessage[]>([]);
  const [counts, setCounts] = useState<Record<EnquiryStatus, number>>(
    Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<EnquiryStatus, number>
  );
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState<string>("");
  const [convertOpen, setConvertOpen] = useState(false);
  const [converting, setConverting] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // When the page is opened with ?enquiry=<id>, jump to that enquiry and
  // switch to the "All" tab so it's visible regardless of current status.
  useEffect(() => {
    if (!focusEnquiryId) return;
    setActiveId(focusEnquiryId);
    setTab("all");
  }, [focusEnquiryId]);

  const refresh = async () => {
    setLoading(true);
    const [{ data }, { data: cData }] = await Promise.all([
      supabase
        .from("inbound_messages")
        .select("id, name, email, phone, subject, message, status, enquiry_status, source, preferred_contact, service_interest, internal_notes, converted_client_id, created_at")
        .order("created_at", { ascending: false })
        .limit(500),
      supabase.from("inbound_messages").select("enquiry_status"),
    ]);
    const list = (data ?? []) as InboundMessage[];
    setRows(list);
    const c = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<EnquiryStatus, number>;
    (cData ?? []).forEach((r: any) => {
      const s = r.enquiry_status as EnquiryStatus;
      if (s in c) c[s]++;
    });
    setCounts(c);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel("inbound_messages_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "inbound_messages" },
        (payload) => {
          refresh();
          if (payload.eventType === "INSERT") {
            const m = payload.new as InboundMessage;
            toast({
              title: "New enquiry 📬",
              description: `${m.name} — ${m.subject ?? (m.message ?? "").slice(0, 60)}`,
            });
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const filtered = useMemo(() => {
    const filter = TAB_FILTERS[tab];
    if (!filter) return rows;
    return rows.filter((r) => filter.includes(r.enquiry_status));
  }, [rows, tab]);

  const active = useMemo(
    () => filtered.find((m) => m.id === activeId) ?? filtered[0],
    [filtered, activeId]
  );

  // Reset notes draft when active row changes
  useEffect(() => {
    setNotesDraft(active?.internal_notes ?? "");
  }, [active?.id]);

  const tabCount = (key: TabKey): number => {
    const f = TAB_FILTERS[key];
    if (!f) return rows.length;
    return f.reduce((sum, s) => sum + (counts[s] ?? 0), 0);
  };

  const setStatus = async (id: string, status: EnquiryStatus) => {
    const { error } = await supabase
      .from("inbound_messages")
      .update({ enquiry_status: status })
      .eq("id", id);
    if (error) {
      toast({ title: "Couldn't update", description: error.message, variant: "destructive" });
      return;
    }
    refresh();
  };

  const saveNotes = async () => {
    if (!active) return;
    setSavingNotes(true);
    const { error } = await supabase
      .from("inbound_messages")
      .update({ internal_notes: notesDraft })
      .eq("id", active.id);
    setSavingNotes(false);
    if (error) {
      toast({ title: "Couldn't save notes", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Notes saved" });
    refresh();
  };

  const convertToClient = async () => {
    if (!active) return;
    setConverting(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-create-client", {
        body: {
          email: active.email.trim(),
          full_name: active.name.trim(),
          method: "invite",
          redirect_to: `${window.location.origin}/welcome`,
        },
      });
      if (error) throw error;
      const result = data as { ok?: boolean; user_id?: string; error?: string };
      if (!result?.ok || !result.user_id) throw new Error(result?.error || "Invite failed");

      const { error: updErr } = await supabase
        .from("inbound_messages")
        .update({
          enquiry_status: "Converted to client",
          converted_client_id: result.user_id,
        })
        .eq("id", active.id);
      if (updErr) throw updErr;

      toast({
        title: "Invitation sent 💌",
        description: `${active.email} will receive a magic link to set their password.`,
      });
      setConvertOpen(false);
      refresh();
    } catch (e: any) {
      toast({ title: "Couldn't convert", description: e?.message ?? "Try again.", variant: "destructive" });
    } finally {
      setConverting(false);
    }
  };

  const deleteEnquiry = async () => {
    if (!active) return;
    setDeleting(true);
    const { error } = await supabase.from("inbound_messages").delete().eq("id", active.id);
    setDeleting(false);
    if (error) {
      toast({ title: "Couldn't delete", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Enquiry deleted" });
    setDeleteOpen(false);
    setActiveId(null);
    refresh();
  };

  const newCount = counts["New"] ?? 0;

  return (
    <div className="space-y-4">
      {/* Header row: tabs + add button */}
      <div className="flex items-center gap-2 flex-wrap justify-between">
        <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-secondary flex-wrap">
          {TAB_LABELS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => { setTab(key); setActiveId(null); }}
              className={cn(
                "flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold transition-calm",
                tab === key ? "bg-card text-primary-deep shadow-soft" : "text-muted-foreground"
              )}
            >
              {label}
              <Badge variant="secondary" className="text-[10px] px-1.5">{tabCount(key)}</Badge>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {newCount > 0 && (
            <Badge className="rounded-full bg-primary/15 text-primary-deep border-0">
              {newCount} new
            </Badge>
          )}
          <AddEnquiryDialog open={addOpen} onOpenChange={setAddOpen} onCreated={refresh} />
        </div>
      </div>

      <div className="grid md:grid-cols-[340px_1fr] gap-5">
        {/* List */}
        <aside className="glass-card p-2 max-h-[calc(100vh-18rem)] overflow-y-auto">
          {loading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading…</p>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Inbox className="h-8 w-8 mx-auto mb-2 opacity-60" />
              <p className="text-sm">No enquiries here.</p>
            </div>
          ) : (
            filtered.map((m) => {
              const isActive = m.id === active?.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setActiveId(m.id)}
                  className={cn(
                    "w-full text-left p-3 rounded-2xl transition-calm block",
                    isActive ? "bg-gradient-ocean text-primary-foreground shadow-soft" : "hover:bg-secondary/60"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className={cn("font-semibold text-sm truncate", isActive && "text-primary-foreground")}>
                      {m.name}
                    </p>
                    <span className={cn("text-[10px] shrink-0", isActive ? "text-primary-foreground/80" : "text-muted-foreground")}>
                      {relativeTime(m.created_at)}
                    </span>
                  </div>
                  <p className={cn("text-xs truncate mt-0.5", isActive ? "text-primary-foreground/80" : "text-muted-foreground")}>
                    {m.subject || (m.message ?? "").slice(0, 80)}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    <Badge
                      variant="secondary"
                      className={cn(
                        "text-[10px] px-1.5 rounded-full",
                        isActive ? "bg-primary-foreground/20 text-primary-foreground border-0" : ""
                      )}
                    >
                      {m.enquiry_status}
                    </Badge>
                    {m.source && (
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] px-1.5 rounded-full",
                          isActive ? "border-primary-foreground/40 text-primary-foreground" : ""
                        )}
                      >
                        {SOURCE_LABEL[m.source]}
                      </Badge>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </aside>

        {/* Detail */}
        <div>
          {active ? (
            <article className="glass-card p-6 space-y-5">
              <header className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <h3 className="font-display text-xl text-primary-deep truncate">
                    {active.subject || "New enquiry"}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    From <span className="font-semibold text-primary-deep">{active.name}</span> ·{" "}
                    <a className="hover:underline" href={`mailto:${active.email}`}>{active.email}</a>
                    {active.phone && (<> · <a className="hover:underline" href={`tel:${active.phone}`}>{active.phone}</a></>)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(active.created_at).toLocaleString()} · {relativeTime(active.created_at)}
                  </p>
                </div>

                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="secondary" className="rounded-xl" asChild>
                    <a href={`mailto:${active.email}?subject=Re:%20${encodeURIComponent(active.subject || "Your message to CareBridge Perth")}`}>
                      <ExternalLink className="h-3.5 w-3.5 mr-1" /> Reply
                    </a>
                  </Button>
                  {active.enquiry_status !== "Converted to client" && (
                    <Button
                      size="sm"
                      className="rounded-xl bg-gradient-ocean gap-1"
                      onClick={() => setConvertOpen(true)}
                    >
                      <UserPlus className="h-3.5 w-3.5" /> Convert to client
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-xl gap-1 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </Button>
                </div>
              </header>

              {/* Status + source row */}
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Pipeline status</Label>
                  <Select
                    value={active.enquiry_status}
                    onValueChange={(v) => setStatus(active.id, v as EnquiryStatus)}
                  >
                    <SelectTrigger className="h-10 rounded-xl bg-card"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Source</Label>
                  <Select
                    value={active.source ?? ""}
                    onValueChange={async (v) => {
                      const { error } = await supabase
                        .from("inbound_messages")
                        .update({ source: v as EnquirySource })
                        .eq("id", active.id);
                      if (error) toast({ title: "Couldn't set source", description: error.message, variant: "destructive" });
                      else refresh();
                    }}
                  >
                    <SelectTrigger className="h-10 rounded-xl bg-card"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      {SOURCES.map((s) => (
                        <SelectItem key={s} value={s}>{SOURCE_LABEL[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Message body */}
              <div>
                <Label className="text-xs text-muted-foreground">Their message</Label>
                <div className="mt-1.5 p-4 rounded-2xl bg-secondary/40 whitespace-pre-wrap text-sm leading-relaxed text-primary-deep">
                  {active.message || "—"}
                </div>
              </div>

              {(active.preferred_contact || active.service_interest) && (
                <div className="grid sm:grid-cols-2 gap-3 text-sm">
                  {active.preferred_contact && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Preferred contact</Label>
                      <p className="mt-1 text-primary-deep">{active.preferred_contact}</p>
                    </div>
                  )}
                  {active.service_interest && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Service interest</Label>
                      <p className="mt-1 text-primary-deep">{active.service_interest}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Internal notes */}
              <div>
                <Label className="text-xs text-muted-foreground">Internal notes (advocate only)</Label>
                <Textarea
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  placeholder="Anything you want to remember about this enquiry…"
                  className="mt-1.5 rounded-2xl bg-card min-h-[100px]"
                  maxLength={4000}
                />
                <div className="flex justify-end mt-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="rounded-xl gap-1"
                    onClick={saveNotes}
                    disabled={savingNotes || notesDraft === (active.internal_notes ?? "")}
                  >
                    {savingNotes ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Save notes
                  </Button>
                </div>
              </div>
            </article>
          ) : (
            <div className="glass-card p-12 text-center text-muted-foreground">
              <Inbox className="h-10 w-10 mx-auto mb-3 text-primary/50" />
              <p className="font-display text-lg text-primary-deep">Your inbox is calm</p>
              <p className="text-sm mt-1">Public enquiries from your website will appear here.</p>
            </div>
          )}
        </div>
      </div>

      {/* Convert confirmation */}
      <AlertDialog open={convertOpen} onOpenChange={setConvertOpen}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Convert {active?.name} to a client?</AlertDialogTitle>
            <AlertDialogDescription>
              We'll send <span className="font-semibold">{active?.email}</span> a gentle invite link
              so they can set their own password. The enquiry will be marked as converted and linked
              to their new client profile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={converting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); convertToClient(); }}
              disabled={converting}
              className="bg-gradient-ocean"
            >
              {converting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <UserPlus className="h-4 w-4 mr-1" />}
              Send invite & convert
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this enquiry?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the enquiry from <span className="font-semibold">{active?.name}</span>
              {active?.email ? <> (<span className="font-semibold">{active.email}</span>)</> : null}.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); deleteEnquiry(); }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />}
              Delete enquiry
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Manual "+ Add enquiry" dialog
// ---------------------------------------------------------------------------
function AddEnquiryDialog({
  open, onOpenChange, onCreated,
}: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [source, setSource] = useState<EnquirySource>("manual");
  const [saving, setSaving] = useState(false);

  const reset = () => { setName(""); setEmail(""); setPhone(""); setMessage(""); setSource("manual"); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from("inbound_messages").insert({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim() || null,
      subject: "Manual enquiry",
      message: message.trim() || "",
      source,
      enquiry_status: "New",
    });
    setSaving(false);
    if (error) {
      toast({ title: "Couldn't add", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Enquiry added" });
    reset();
    onOpenChange(false);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button className="h-10 rounded-2xl bg-gradient-ocean gap-1.5">
          <Plus className="h-4 w-4" /> Add enquiry
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-3xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl text-primary-deep">Add an enquiry</DialogTitle>
          <DialogDescription>
            Log someone who reached out through another channel — phone, referral, in person, anywhere.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="enq-name">Name</Label>
            <Input id="enq-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} required className="h-11 rounded-xl bg-card" />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="enq-email">Email</Label>
              <Input id="enq-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={255} required className="h-11 rounded-xl bg-card" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="enq-phone">Phone (optional)</Label>
              <Input id="enq-phone" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={50} className="h-11 rounded-xl bg-card" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="enq-source">Source</Label>
            <Select value={source} onValueChange={(v) => setSource(v as EnquirySource)}>
              <SelectTrigger className="h-11 rounded-xl bg-card"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SOURCES.map((s) => (
                  <SelectItem key={s} value={s}>{SOURCE_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="enq-msg">Message / context</Label>
            <Textarea id="enq-msg" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={4000} className="rounded-xl bg-card min-h-[100px]" />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving} className="rounded-2xl bg-gradient-ocean gap-1">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add enquiry
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
