import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import {
  useReports,
  useReportComments,
  type ReportItem,
  type ReportStage,
  type ReportVisibility,
  REPORT_STAGE_LABELS,
  REPORT_VISIBILITY_LABELS,
} from "@/lib/reports-store";
import {
  FileText, Download, Loader2, CheckCircle2, Trash2, MessageCircle,
  ShieldCheck, PencilLine, Eye, EyeOff, Send,
} from "lucide-react";

function fmtDate(d: string | null) {
  if (!d) return "";
  return new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
function fmtDateTime(d: string) {
  return new Date(d).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
function fmtSize(b: number | null) {
  if (!b) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

const STAGE_ORDER: ReportStage[] = ["draft", "v1", "v2", "v3", "finalised", "updated"];

interface Props {
  clientId: string;
  viewerRole: "advocate" | "client";
}

export function ClientReportsSection({ clientId, viewerRole }: Props) {
  const { reports, loading, reload } = useReports(clientId);
  const isAdvocate = viewerRole === "advocate";

  const visible = isAdvocate ? reports : reports.filter((r) => r.visibility === "shared");

  return (
    <section className="glass-card p-6">
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <ShieldCheck className="h-4 w-4 text-accent" />
        <h2 className="font-display text-xl text-primary-deep">Reports</h2>
        <span className="text-xs text-muted-foreground">Medical-history reports</span>
        {isAdvocate && (
          <div className="ml-auto">
            <NewReportButton clientId={clientId} onCreated={reload} />
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {isAdvocate ? "No reports yet. Add one to get started." : "No reports have been shared with you yet."}
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map((r) => (
            <ReportRow key={r.id} report={r} isAdvocate={isAdvocate} onChange={reload} />
          ))}
        </ul>
      )}
    </section>
  );
}

function NewReportButton({ clientId, onCreated }: { clientId: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [stage, setStage] = useState<ReportStage>("draft");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const create = async () => {
    if (!title.trim()) { toast({ title: "Give the report a title" }); return; }
    setBusy(true);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) { setBusy(false); return; }

    let storage_path: string | null = null;
    let file_name: string | null = null;
    let mime_type: string | null = null;
    let size_bytes: number | null = null;
    const file = fileRef.current?.files?.[0];
    if (file) {
      const path = `${clientId}/reports/${crypto.randomUUID()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("client-documents").upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) { toast({ title: "Upload failed", description: upErr.message, variant: "destructive" }); setBusy(false); return; }
      storage_path = path; file_name = file.name; mime_type = file.type; size_bytes = file.size;
    }
    const { error } = await supabase.from("reports").insert({
      client_id: clientId, created_by: uid, title: title.trim(),
      storage_path, file_name, mime_type, size_bytes,
      status: "draft", stage, visibility: "private",
    } as any);
    setBusy(false);
    if (error) { toast({ title: "Couldn't save", description: error.message, variant: "destructive" }); return; }
    setTitle(""); setStage("draft"); if (fileRef.current) fileRef.current.value = "";
    setOpen(false); onCreated();
    toast({ title: "Saved", description: "Private to you until you set it to Shared." });
  };

  if (!open) {
    return <Button size="sm" variant="outline" className="rounded-full" onClick={() => setOpen(true)}><PencilLine className="h-4 w-4 mr-1.5" />New report</Button>;
  }
  return (
    <div className="p-3 rounded-2xl bg-secondary/40 flex flex-col gap-2 w-full max-w-xl">
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Report title" className="h-10 rounded-2xl bg-background" />
      <div className="flex flex-col sm:flex-row gap-2">
        <Select value={stage} onValueChange={(v) => setStage(v as ReportStage)}>
          <SelectTrigger className="h-10 rounded-2xl bg-background sm:w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STAGE_ORDER.map((s) => <SelectItem key={s} value={s}>{REPORT_STAGE_LABELS[s]}</SelectItem>)}
          </SelectContent>
        </Select>
        <input ref={fileRef} type="file" className="text-xs self-center" />
      </div>
      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="ghost" className="rounded-full" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
        <Button size="sm" className="rounded-full" onClick={create} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save report"}
        </Button>
      </div>
    </div>
  );
}

function ReportRow({ report, isAdvocate, onChange }: { report: ReportItem; isAdvocate: boolean; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [showComments, setShowComments] = useState(false);

  const download = async () => {
    if (!report.storagePath) return;
    const { data, error } = await supabase.storage.from("client-documents").createSignedUrl(report.storagePath, 60);
    if (error || !data) { toast({ title: "Couldn't open file", variant: "destructive" }); return; }
    window.open(data.signedUrl, "_blank");
  };

  const setStage = async (stage: ReportStage) => {
    setBusy(true);
    const { error } = await supabase.rpc("set_report_stage_visibility" as any, {
      _report_id: report.id, _stage: stage, _visibility: report.visibility,
    } as any);
    setBusy(false);
    if (error) return toast({ title: "Couldn't update stage", description: error.message, variant: "destructive" });
    onChange();
  };

  const setVisibility = async (visibility: ReportVisibility) => {
    setBusy(true);
    const { error } = await supabase.rpc("set_report_stage_visibility" as any, {
      _report_id: report.id, _stage: report.stage, _visibility: visibility,
    } as any);
    setBusy(false);
    if (error) return toast({ title: "Couldn't update visibility", description: error.message, variant: "destructive" });
    onChange();
    toast({ title: visibility === "shared" ? "Now shared with client" : "Now private" });
  };

  const remove = async () => {
    if (!confirm("Delete this report?")) return;
    setBusy(true);
    if (report.storagePath) await supabase.storage.from("client-documents").remove([report.storagePath]);
    const { error } = await supabase.from("reports").delete().eq("id", report.id);
    setBusy(false);
    if (error) return toast({ title: "Couldn't delete", description: error.message, variant: "destructive" });
    onChange();
  };

  const agree = async () => {
    if (!confirm("Confirm this report looks right? It will be marked as Agreed.")) return;
    setBusy(true);
    const { error } = await supabase.rpc("agree_report", { _report_id: report.id });
    setBusy(false);
    if (error) return toast({ title: "Couldn't confirm", description: error.message, variant: "destructive" });
    toast({ title: "Thank you", description: "Report marked as Agreed." });
    onChange();
  };

  const isShared = report.visibility === "shared";

  return (
    <li className="p-4 rounded-2xl bg-secondary/40">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-ocean flex items-center justify-center shrink-0">
          <FileText className="h-4 w-4 text-primary-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold truncate">{report.title}</p>
            <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-background text-primary-deep">
              {REPORT_STAGE_LABELS[report.stage]}
            </span>
            <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${isShared ? "bg-sky-100 text-sky-900" : "bg-secondary text-muted-foreground"}`}>
              {isShared ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
              {isShared ? "Shared" : "Private"}
            </span>
            {report.clientAgreedAt && (
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full inline-flex items-center gap-1 bg-emerald-100 text-emerald-900">
                <CheckCircle2 className="h-3 w-3" /> Agreed
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Created {fmtDate(report.createdAt)}
            {report.fileName && <> · {report.fileName} · {fmtSize(report.sizeBytes)}</>}
            {report.sharedAt && <> · shared {fmtDate(report.sharedAt)}</>}
            {report.clientAgreedAt && <> · agreed {fmtDate(report.clientAgreedAt)}</>}
          </p>

          {/* Advocate controls — labelled, visible dropdowns */}
          {isAdvocate && (
            <div className="mt-3 p-3 rounded-2xl bg-background border border-border/60 flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1 min-w-[12rem] flex-1">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Stage</label>
                <Select value={report.stage} onValueChange={(v) => setStage(v as ReportStage)} disabled={busy}>
                  <SelectTrigger className="h-10 rounded-xl bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STAGE_ORDER.map((s) => <SelectItem key={s} value={s}>{REPORT_STAGE_LABELS[s]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1 min-w-[14rem] flex-1">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Visibility</label>
                <Select value={report.visibility} onValueChange={(v) => setVisibility(v as ReportVisibility)} disabled={busy}>
                  <SelectTrigger className="h-10 rounded-xl bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="private">{REPORT_VISIBILITY_LABELS.private}</SelectItem>
                    <SelectItem value="shared">{REPORT_VISIBILITY_LABELS.shared}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mb-2" />}
            </div>
          )}

          {/* Action buttons */}
          <div className="mt-3 flex flex-wrap gap-2">
            {report.storagePath && (
              <Button size="sm" variant="outline" className="rounded-full" onClick={download}>
                <Download className="h-3.5 w-3.5 mr-1.5" />Download
              </Button>
            )}
            {isShared && (
              <Button size="sm" variant="outline" className="rounded-full" onClick={() => setShowComments((v) => !v)}>
                <MessageCircle className="h-3.5 w-3.5 mr-1.5" />
                {showComments ? "Hide comments" : "Comments"}
              </Button>
            )}
            {!isAdvocate && isShared && !report.clientAgreedAt && (
              <Button size="sm" className="rounded-full bg-emerald-600 hover:bg-emerald-700 text-white" onClick={agree} disabled={busy}>
                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />This looks right
              </Button>
            )}
            {!isAdvocate && report.clientAgreedAt && (
              <span className="text-xs text-emerald-700 inline-flex items-center gap-1 self-center">
                <CheckCircle2 className="h-3.5 w-3.5" /> You confirmed this on {fmtDate(report.clientAgreedAt)}
              </span>
            )}
            {isAdvocate && (
              <Button size="sm" variant="ghost" className="rounded-full text-muted-foreground hover:text-destructive ml-auto" onClick={remove} disabled={busy}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>

          {isShared && showComments && (
            <ReportComments reportId={report.id} viewerRole={isAdvocate ? "advocate" : "client"} />
          )}
        </div>
      </div>
    </li>
  );
}

function ReportComments({ reportId, viewerRole }: { reportId: string; viewerRole: "advocate" | "client" }) {
  const { comments, loading } = useReportComments(reportId);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const post = async () => {
    if (!draft.trim()) return;
    setBusy(true);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) { setBusy(false); return; }
    const { error } = await supabase.from("report_comments" as any).insert({
      report_id: reportId, author_id: uid, author_role: viewerRole, body: draft.trim(),
    } as any);
    setBusy(false);
    if (error) { toast({ title: "Couldn't post", description: error.message, variant: "destructive" }); return; }
    setDraft("");
  };

  return (
    <div className="mt-3 p-3 rounded-2xl bg-background border border-border/60">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Comments</p>
      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : comments.length === 0 ? (
        <p className="text-xs text-muted-foreground mb-3">No comments yet — add a note about anything you'd like adjusted.</p>
      ) : (
        <ul className="space-y-2 mb-3">
          {comments.map((c) => {
            const mine = c.authorRole === viewerRole;
            const who = mine ? "You" : c.authorRole === "advocate" ? "Your advocate" : "Client";
            return (
              <li key={c.id} className={`p-2.5 rounded-xl text-xs ${mine ? "bg-sky-50" : "bg-secondary/60"}`}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-semibold text-primary-deep">{who}</span>
                  <span className="text-[10px] text-muted-foreground">{fmtDateTime(c.createdAt)}</span>
                </div>
                <p className="text-primary-deep whitespace-pre-wrap">{c.body}</p>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-col gap-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={viewerRole === "advocate" ? "Reply to the client…" : "What would you like adjusted?"}
          rows={2}
          className="rounded-2xl bg-background"
        />
        <div className="flex justify-end">
          <Button size="sm" className="rounded-full" onClick={post} disabled={busy || !draft.trim()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-3.5 w-3.5 mr-1.5" />Post comment</>}
          </Button>
        </div>
      </div>
    </div>
  );
}
