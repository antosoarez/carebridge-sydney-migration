import { useParams, Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/ocean/AppShell";
import { ClientAvatar } from "@/components/ocean/ClientAvatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { useClients } from "@/lib/clients-store";
import { ClientTasksPanel } from "@/components/ocean/ClientTasksPanel";
import { EmotionWaveCard } from "@/components/ocean/EmotionWaveCard";
import { computeLowMoodFlags } from "@/lib/low-mood-flag";
import { Heart } from "lucide-react";
import { ClientDocumentsSection } from "@/components/ocean/ClientDocumentsSection";
import { CareJourneyTimeline } from "@/components/ocean/CareJourneyTimeline";
import { ClientReportsSection } from "@/components/ocean/ClientReportsSection";
import { MiniUpcomingAppointments } from "@/components/ocean/MiniUpcomingAppointments";
import { ClientEngagementBar } from "@/components/ocean/ClientEngagementBar";
import { useOwnClientProgress } from "@/lib/client-progress";
import { ClientPaymentTracker } from "@/components/ocean/ClientPaymentTracker";
import { ManualPaymentOverride } from "@/components/ocean/ManualPaymentOverride";
import { ClientAgreementsPanel } from "@/components/ocean/ClientAgreementsPanel";
import { PaymentLinkField } from "@/components/ocean/PaymentLinkField";
import { useAgreements } from "@/lib/agreements-store";
import { CopyInviteLinkButton } from "@/components/ocean/CopyInviteLinkButton";
import { EmailChangeSection, EmailChangeAuditLog } from "@/components/ocean/EmailChangeSection";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";
import { ArrowLeft, CalendarRange, Lock, RefreshCw, Sparkles } from "lucide-react";
import { LifecycleStatusSelect } from "@/components/ocean/LifecycleStatusSelect";
import { UrgencyBadge } from "@/components/ocean/UrgencyBadge";
import { ClientCasesPanel } from "@/components/ocean/ClientCasesPanel";
import { ClientCrmSummary } from "@/components/ocean/ClientCrmSummary";
import { NavigationIntakeTab } from "@/components/ocean/NavigationIntakeTab";
import { ClientIntakeTab } from "@/components/ocean/ClientIntakeTab";
import { AgreementStatusList } from "@/components/ocean/AgreementStatusList";

function countdownLabel(toDate: string | null): string | null {
  if (!toDate) return null;
  const ms = new Date(toDate + "T23:59:59").getTime() - Date.now();
  const days = Math.ceil(ms / (1000 * 60 * 60 * 24));
  if (days > 1) return `${days} days until the requested completion`;
  if (days === 1) return "1 day until the requested completion";
  if (days === 0) return "Due today — take it gently";
  return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} past the requested date — no rush`;
}

interface ReportCardProps {
  clientId: string;
  initialProgress: number;
  initialFrom: string | null;
  initialTo: string | null;
  onReset: () => void;
}

function ReportProgressCard({ clientId, initialProgress, initialFrom, initialTo, onReset }: ReportCardProps) {
  const [value, setValue] = useState<number>(initialProgress);
  const [fromDate, setFromDate] = useState<string>(initialFrom ?? "");
  const [toDate, setToDate] = useState<string>(initialTo ?? "");
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [resetting, setResetting] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setValue(initialProgress); }, [initialProgress, clientId]);
  useEffect(() => { setFromDate(initialFrom ?? ""); }, [initialFrom, clientId]);
  useEffect(() => { setToDate(initialTo ?? ""); }, [initialTo, clientId]);

  const queueSave = (patch: { report_progress?: number; report_requested_from?: string | null; report_requested_to?: string | null }) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setSaving(true);
      const { error } = await supabase
        .from("client_report_meta")
        .upsert({ client_id: clientId, ...patch }, { onConflict: "client_id" });
      setSaving(false);
      if (error) {
        toast({ title: "Couldn't save", description: error.message, variant: "destructive" });
        return;
      }
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1200);
    }, 600);
  };

  const updateProgress = (n: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(n)));
    setValue(clamped);
    queueSave({ report_progress: clamped });
  };

  const updateFrom = (v: string) => {
    setFromDate(v);
    queueSave({ report_requested_from: v || null });
  };
  const updateTo = (v: string) => {
    setToDate(v);
    queueSave({ report_requested_to: v || null });
  };

  const handleReset = async () => {
    if (!confirm("Start a fresh round? This resets Report Progress to 0% and marks the report as Updating. Client engagement stays as it is.")) return;
    setResetting(true);
    const { error } = await supabase.rpc("reset_report_progress", { _client_id: clientId });
    setResetting(false);
    if (error) {
      toast({ title: "Couldn't reset", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Fresh round started", description: "Report Progress is back to 0%." });
    setValue(0);
    onReset();
  };

  const countdown = countdownLabel(toDate || null);

  return (
    <section className="glass-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="h-4 w-4 text-primary" />
        <h2 className="font-display text-xl text-primary-deep">Report progress</h2>
        <span
          className={`ml-auto text-xs transition-opacity duration-500 ${savedFlash ? "opacity-100 text-primary" : "opacity-0"}`}
          aria-live="polite"
        >
          Saved
        </span>
      </div>

      <div
        className="h-3 w-full rounded-full overflow-hidden"
        style={{ backgroundColor: "hsl(210 25% 92%)", boxShadow: "inset 0 1px 2px hsl(210 25% 80% / 0.5)" }}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Report progress"
      >
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{
            width: `${value}%`,
            background: "linear-gradient(90deg, hsl(200 70% 82%), hsl(200 70% 72%))",
          }}
        />
      </div>

      <p className="mt-3 text-sm text-primary-deep">
        <span className="font-semibold">{value}%</span>
        <span className="text-muted-foreground"> — {value === 100 ? "Beautifully done" : value >= 76 ? "Almost there — well done" : value >= 51 ? "Good progress" : value >= 26 ? "Making steady progress" : value >= 1 ? "A calm start" : "Let's begin gently"}</span>
      </p>

      <div className="mt-4 flex items-center gap-4">
        <Slider
          value={[value]}
          min={0}
          max={100}
          step={1}
          onValueChange={(v) => updateProgress(v[0] ?? 0)}
          aria-label="Set report progress"
          className="flex-1"
        />
        <div className="flex items-center gap-1">
          <Input
            type="number"
            min={0}
            max={100}
            value={value}
            onChange={(e) => updateProgress(Number(e.target.value))}
            className="h-10 w-20 rounded-2xl bg-secondary/40 border-0 text-center"
            aria-label="Report progress percentage"
          />
          <span className="text-sm text-muted-foreground">%</span>
        </div>
      </div>

      <div className="mt-6 grid sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground" htmlFor="req-from">Report requested from</label>
          <Input
            id="req-from"
            type="date"
            value={fromDate}
            onChange={(e) => updateFrom(e.target.value)}
            className="mt-1 h-10 rounded-2xl bg-secondary/40 border-0"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground" htmlFor="req-to">Report requested to</label>
          <Input
            id="req-to"
            type="date"
            value={toDate}
            onChange={(e) => updateTo(e.target.value)}
            className="mt-1 h-10 rounded-2xl bg-secondary/40 border-0"
          />
        </div>
      </div>

      {countdown && (
        <p className="mt-3 text-xs text-muted-foreground">{countdown} · advocate-only view</p>
      )}

      {value === 100 && (
        <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl bg-accent/5 p-3">
          <p className="text-sm text-primary-deep">
            Report finalised. Starting a new round?
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={resetting}
            className="rounded-full"
          >
            <RefreshCw className="h-4 w-4 mr-1.5" />
            {resetting ? "Resetting…" : "Update report"}
          </Button>
        </div>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        Manual bar — only visible to advocates. {saving ? " Saving…" : ""}
      </p>
    </section>
  );
}

function PaymentLinkSection({ clientId }: { clientId: string }) {
  const { allRequiredAccepted } = useAgreements(clientId);
  return (
    <section className="glass-card p-6 space-y-3">
      <h2 className="font-display text-xl text-primary-deep">Payment link</h2>
      <PaymentLinkField clientId={clientId} unlocked={allRequiredAccepted} />
    </section>
  );
}

function InternalNotesCard({ clientId }: { clientId: string }) {
  const [body, setBody] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstLoad = useRef(true);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    firstLoad.current = true;
    (async () => {
      const { data } = await supabase
        .from("client_internal_notes")
        .select("body, updated_at")
        .eq("client_id", clientId)
        .maybeSingle();
      if (cancelled) return;
      setBody((data?.body as string) ?? "");
      setUpdatedAt((data?.updated_at as string) ?? null);
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  useEffect(() => {
    if (!loaded) return;
    if (firstLoad.current) { firstLoad.current = false; return; }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setSaving(true);
      const { data, error } = await supabase
        .from("client_internal_notes")
        .upsert({ client_id: clientId, body }, { onConflict: "client_id" })
        .select("updated_at")
        .maybeSingle();
      setSaving(false);
      if (error) {
        toast({ title: "Couldn't save notes", description: error.message, variant: "destructive" });
        return;
      }
      setUpdatedAt((data?.updated_at as string) ?? new Date().toISOString());
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1200);
    }, 600);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [body, loaded, clientId]);

  const edited = updatedAt
    ? `Last edited ${new Date(updatedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`
    : "Not edited yet";

  return (
    <section className="glass-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <Lock className="h-4 w-4 text-accent" />
        <h2 className="font-display text-xl text-primary-deep">Internal notes</h2>
        <span className="text-xs text-muted-foreground">(only you can see this)</span>
        <span
          className={`ml-auto text-xs transition-opacity duration-500 ${savedFlash ? "opacity-100 text-primary" : "opacity-0"}`}
          aria-live="polite"
        >
          Saved
        </span>
      </div>
      <Textarea
        aria-label="Internal notes"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Jot anything down — context, reminders, things to follow up. Saved automatically."
        rows={6}
        disabled={!loaded}
        className="rounded-2xl bg-secondary/40 border-0 resize-none focus-visible:ring-2 focus-visible:ring-primary/40"
      />
      <p className="text-xs text-muted-foreground mt-2">
        {saving ? "Saving…" : edited} · private to advocates
      </p>
    </section>
  );
}


export default function AdvocateClientDetail() {
  const { id } = useParams();
  const { clients, loading, reload } = useClients();
  const client = clients.find((c) => c.id === id);
  const { value: liveProgress } = useOwnClientProgress(client?.id);


  if (loading) {
    return <AppShell role="advocate"><div className="text-muted-foreground">Loading…</div></AppShell>;
  }

  if (!client) {
    return (
      <AppShell role="advocate" seoTitle="Client not found">
        <Link to="/advocate/clients" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary mb-6">
          <ArrowLeft className="h-4 w-4" /> All clients
        </Link>
        <div className="glass-card p-12 text-center">
          <h1 className="font-display text-2xl text-primary-deep">Client not found</h1>
          <p className="text-sm text-muted-foreground mt-1">This case may have been removed.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell role="advocate" seoTitle={`${client.name} — Client file`} seoDescription={`${client.name}'s care file.`}>
      <div className="flex items-center justify-between mb-6">
        <Link to="/advocate/clients" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary">
          <ArrowLeft className="h-4 w-4" /> All clients
        </Link>
        <Link to={`/advocate/availability/new?client=${client.id}`}>
          <Button variant="outline" size="sm" className="rounded-full gap-1.5">
            <CalendarRange className="h-4 w-4" /> Request availability
          </Button>
        </Link>
      </div>


      <div className="glass-card p-6 md:p-8 mb-6 bg-gradient-card">
        <div className="flex flex-col md:flex-row md:items-center gap-6">
          <ClientAvatar name={client.name} gradient={client.avatarColor} size="lg" />
          <div className="flex-1 min-w-0 space-y-3">
            <div>
              <h1 className="font-display text-3xl text-primary-deep">{client.name}</h1>
              <p className="text-muted-foreground">{client.email}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <LifecycleStatusSelect
                clientId={client.id}
                value={client.lifecycleStatus}
                onChanged={reload}
              />
              <UrgencyBadge clientId={client.id} />
            </div>
            <EmailChangeSection
              targetUserId={client.id}
              currentEmail={client.email}
              mode="advocate"
              onChanged={reload}
            />
            {client.status === "invited" && (
              <div className="flex flex-wrap gap-2 pt-1">
                <CopyInviteLinkButton email={client.email} variant="outline" />
                <span className="text-xs text-muted-foreground self-center">
                  Send by WhatsApp, SMS or your own email. Each link is unique to this client and one-time-use.
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <ClientCrmSummary clientId={client.id} />

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <NavigationIntakeTab clientId={client.id} />
          <ClientIntakeTab clientId={client.id} />
          <AgreementStatusList clientId={client.id} />
          <EmotionWaveCard clientId={client.id} viewerRole="advocate" />
          <LowMoodFlagChip clientId={client.id} />
          <ClientCasesPanel clientId={client.id} />
          <ClientTasksPanel clientId={client.id} canManage />

          <ReportProgressCard
            clientId={client.id}
            initialProgress={client.reportProgress}
            initialFrom={client.reportRequestedFrom}
            initialTo={client.reportRequestedTo}
            onReset={reload}
          />

          <ClientEngagementBar
            value={liveProgress || client.clientProgress}
            variant="secondary"
            title="Client engagement"
            subtitle="Updates automatically as your client attends, uploads, and replies. Caps at 75% until you mark the report complete."
            readOnlyNote="read-only"
          />


          <ClientDocumentsSection clientId={client.id} canManage />

          <ClientReportsSection clientId={client.id} viewerRole="advocate" />

          <ClientAgreementsPanel clientId={client.id} asAdvocate />

          <ClientPaymentTracker clientId={client.id} clientName={client.name.split(" ")[0]} />

          <ManualPaymentOverride clientId={client.id} clientName={client.name.split(" ")[0]} />

          <PaymentLinkSection clientId={client.id} />

          <InternalNotesCard clientId={client.id} />

          <EmailChangeAuditLog clientId={client.id} />
        </div>

        <aside className="space-y-6">
          <MiniUpcomingAppointments clientId={client.id} clientColour={client.clientColour} />
          <CareJourneyTimeline clientId={client.id} />
        </aside>

      </div>
    </AppShell>
  );
}

// Small calm chip — sits beside the wave on the patient profile so the advocate
// sees the 3-day low-mood pattern integrated with the chart. Uses the note-free
// RPC so optional written notes are never read.
function LowMoodFlagChip({ clientId }: { clientId: string }) {
  const [flag, setFlag] = useState<{ streak: number; lastDate: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc("get_recent_low_mood_rows", { _days: 7 });
      if (cancelled || !data) return;
      const rows = (data as { user_id: string; emotion: string; created_at: string }[])
        .filter((r) => r.user_id === clientId);
      const flags = computeLowMoodFlags(rows as any);
      setFlag(flags.get(clientId) ?? null);
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  if (!flag) return null;
  return (
    <div className="rounded-2xl bg-[#f1f5ef] border border-[#cdddc9] p-4 flex items-start gap-3">
      <Heart className="h-5 w-5 text-[#8BA888] mt-0.5" strokeWidth={1.75} />
      <p className="text-sm text-[#1C2B3A] leading-snug">
        Needs a gentle check-in — low-mood pattern for{" "}
        <span className="font-medium text-[#8BA888]">{flag.streak} days in a row</span>
        {" "}(most recent {flag.lastDate}).
      </p>
    </div>
  );
}
