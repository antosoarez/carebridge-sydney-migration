import { useState } from "react";
import { AppShell } from "@/components/ocean/AppShell";
import { useTemplates, type TemplateAudience, type DocTemplate } from "@/lib/templates-store";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { FileText, Plus, Trash2, Download, User, Building2, Users as UsersIcon, Upload, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const audienceMeta: Record<TemplateAudience, { label: string; icon: typeof User; color: string }> = {
  patient: { label: "Patient", icon: User, color: "bg-primary/10 text-primary" },
  clinic: { label: "Clinic", icon: Building2, color: "bg-accent/15 text-accent" },
  both: { label: "Both", icon: UsersIcon, color: "bg-secondary text-secondary-foreground" },
};

function formatSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Templates() {
  const { items, loading, add, remove, getDownloadUrl } = useTemplates();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [audience, setAudience] = useState<TemplateAudience>("patient");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      await add({ title: title.trim(), description: description.trim(), audience, file });
      toast.success("Template saved");
      setTitle(""); setDescription(""); setFile(null); setAudience("patient"); setOpen(false);
    } catch (err: any) {
      toast.error(err?.message ?? "Couldn't save template");
    } finally {
      setSaving(false);
    }
  };

  const download = async (t: DocTemplate) => {
    if (!t.storage_path) return;
    try {
      const url = await getDownloadUrl(t.storage_path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      toast.error(err?.message ?? "Couldn't open file");
    }
  };

  return (
    <AppShell
      role="advocate"
      title="Document templates"
      subtitle="Reusable forms and documents you ask patients or clinics to complete."
    >
      <div className="mb-6">
        <Button onClick={() => setOpen(o => !o)} className="rounded-2xl bg-gradient-ocean text-primary-foreground gap-2">
          <Plus className="h-4 w-4" /> {open ? "Close" : "Add template"}
        </Button>
      </div>

      {open && (
        <form onSubmit={submit} className="glass-card p-5 md:p-6 bg-gradient-card mb-8 space-y-3 animate-fade-in">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Template title (e.g. Symptom diary)" />
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this for? (optional)" className="min-h-[80px]" />

          <label className="flex items-center gap-3 p-3 rounded-xl border border-dashed border-primary/30 bg-secondary/30 cursor-pointer hover:bg-secondary/50 transition-calm">
            <Upload className="h-4 w-4 text-primary shrink-0" />
            <span className="text-sm text-muted-foreground truncate">
              {file ? `${file.name} (${formatSize(file.size)})` : "Attach a PDF or Word document (optional)"}
            </span>
            <input
              type="file"
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>

          <div className="flex flex-wrap gap-2">
            {(["patient", "clinic", "both"] as TemplateAudience[]).map((a) => {
              const M = audienceMeta[a];
              const Icon = M.icon;
              return (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAudience(a)}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-calm",
                    audience === a ? "bg-primary text-primary-foreground" : "bg-secondary/60 text-muted-foreground"
                  )}
                >
                  <Icon className="h-3 w-3" /> For {M.label.toLowerCase()}
                </button>
              );
            })}
          </div>
          <Button type="submit" disabled={!title.trim() || saving} className="rounded-xl bg-gradient-ocean text-primary-foreground">
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Save template
          </Button>
        </form>
      )}

      <div className="space-y-3">
        {loading && (
          <div className="glass-card p-10 text-center text-muted-foreground">Loading…</div>
        )}
        {!loading && items.length === 0 && (
          <div className="glass-card p-10 text-center text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-3 text-primary/60" />
            No templates yet.
          </div>
        )}
        {items.map((t) => {
          const M = audienceMeta[t.audience];
          const Icon = M.icon;
          return (
            <article key={t.id} className="glass-card p-5 flex items-start gap-4">
              <div className={cn("h-10 w-10 rounded-2xl flex items-center justify-center shrink-0", M.color)}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-primary-deep">{t.title}</h3>
                  <span className={cn("text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full", M.color)}>For {M.label}</span>
                </div>
                {t.description && <p className="text-sm text-muted-foreground mt-1">{t.description}</p>}
                {t.file_name && (
                  <button
                    onClick={() => download(t)}
                    className="inline-flex items-center gap-1 text-xs text-primary font-semibold mt-2 hover:underline"
                  >
                    <Download className="h-3 w-3" /> {t.file_name} {t.size_bytes ? `· ${formatSize(t.size_bytes)}` : ""}
                  </button>
                )}
              </div>
              <button onClick={() => remove(t)} className="text-muted-foreground hover:text-destructive p-1" aria-label="Remove template">
                <Trash2 className="h-4 w-4" />
              </button>
            </article>
          );
        })}
      </div>
    </AppShell>
  );
}
