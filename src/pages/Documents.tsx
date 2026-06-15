import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/ocean/AppShell";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { FileImage, FileText, UploadCloud, Loader2, ShieldCheck, Clock, Download, Lock, Trash2, Folder, FolderOpen, ChevronRight, ArrowLeft, Mail } from "lucide-react";
import { toast } from "sonner";

interface DocRow {
  id: string;
  client_id: string;
  uploaded_by: string;
  name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  status: "pending_review" | "triaged" | "archived";
  visibility: "shared" | "advocate_private";
  created_at: string;
}

interface PrivateFile {
  name: string;
  path: string;
  size: number | null;
  mime: string | null;
  created_at: string;
}

interface ProfileLite { id: string; full_name: string | null; email: string; }

function formatSize(bytes: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(d: string) {
  const date = new Date(d);
  const today = new Date();
  const same = date.toDateString() === today.toDateString();
  return same ? `today, ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` :
    date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function DocumentsPage() {
  const { user, role } = useAuth();
  const isAdvocate = role === "advocate";
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [privateDocs, setPrivateDocs] = useState<PrivateFile[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});
  const [clientsList, setClientsList] = useState<ProfileLite[]>([]);
  const [drag, setDrag] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [advocateTab, setAdvocateTab] = useState<"clients" | "private">("clients");
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [openFolder, setOpenFolder] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const privateInput = useRef<HTMLInputElement>(null);

  const load = async () => {
    const { data } = await supabase.from("documents").select("*").order("created_at", { ascending: false });
    setDocs((data as DocRow[]) ?? []);
    if (isAdvocate && data) {
      const ids = Array.from(new Set(data.map(d => d.client_id)));
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id,full_name,email").in("id", ids);
        const map: Record<string, ProfileLite> = {};
        (profs ?? []).forEach(p => { map[p.id] = p as ProfileLite; });
        setProfiles(map);
      }
    }
  };

  // Load advocate's private files directly from the my-documents bucket (no DB row).
  const loadPrivate = async () => {
    if (!user) return;
    const { data, error } = await supabase.storage
      .from("my-documents")
      .list(user.id, { limit: 200, sortBy: { column: "created_at", order: "desc" } });
    if (error) { console.error(error); return; }
    setPrivateDocs((data ?? []).filter(f => f.name && f.id).map(f => ({
      name: f.name,
      path: `${user.id}/${f.name}`,
      size: (f.metadata as any)?.size ?? null,
      mime: (f.metadata as any)?.mimetype ?? null,
      created_at: f.created_at ?? new Date().toISOString(),
    })));
  };

  const loadClients = async () => {
    const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "client");
    const ids = (roles ?? []).map(r => r.user_id);
    if (!ids.length) { setClientsList([]); return; }
    const { data: profs } = await supabase.from("profiles").select("id,full_name,email").in("id", ids).order("full_name");
    setClientsList((profs ?? []) as ProfileLite[]);
  };

  useEffect(() => {
    load();
    if (isAdvocate) {
      loadClients();
      loadPrivate();
    }
    const channel = supabase.channel("documents-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "documents" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, user?.id]);

  // Client self-upload
  const handleClientFiles = async (files: FileList | null) => {
    if (!files || !files.length || !user) return;
    setUploading(true);
    const { data: prof } = await supabase.from("profiles").select("full_name,email").eq("id", user.id).maybeSingle();
    const clientName = prof?.full_name || prof?.email || "A client";
    for (const file of Array.from(files)) {
      const path = `${user.id}/${crypto.randomUUID()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("client-documents").upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) { toast.error(`Upload failed: ${file.name}`); continue; }
      const docId = crypto.randomUUID();
      const { error: insErr } = await supabase.from("documents").insert({
        id: docId, client_id: user.id, uploaded_by: user.id,
        name: file.name, storage_path: path, mime_type: file.type, size_bytes: file.size,
        visibility: "shared",
      });
      if (insErr) { toast.error(`Couldn't save record: ${file.name}`); continue; }
      supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "document-upload-alert",
          recipientEmail: "hello@carebridgeperth.com",
          idempotencyKey: `doc-upload-${docId}`,
          templateData: { clientName, fileName: file.name, documentId: docId, uploadedAt: new Date().toLocaleString() },
        },
      }).catch((e) => console.error("alert send failed", e));
    }
    setUploading(false);
    toast.success("Uploaded — your advocate has been notified.");
    if (fileInput.current) fileInput.current.value = "";
    load();
  };

  // Advocate uploads into a client's folder (works even if client hasn't activated — folder is keyed on client_id).
  const handleAdvocateClientUpload = async (files: FileList | null) => {
    if (!files || !files.length || !user) return;
    if (!selectedClient) { toast.error("Pick a client first"); return; }
    setUploading(true);
    for (const file of Array.from(files)) {
      const path = `${selectedClient}/${crypto.randomUUID()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("client-documents").upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) { toast.error(`Upload failed: ${file.name}`); continue; }
      const { error: insErr } = await supabase.from("documents").insert({
        client_id: selectedClient,
        uploaded_by: user.id,
        name: file.name,
        storage_path: path,
        mime_type: file.type,
        size_bytes: file.size,
        status: "triaged",
        visibility: "shared",
      });
      if (insErr) { toast.error(`Couldn't save record: ${file.name}`); continue; }
    }
    setUploading(false);
    toast.success("Uploaded into client's profile");
    if (fileInput.current) fileInput.current.value = "";
    load();
  };

  // Advocate uploads to their own private workspace in the my-documents bucket (no DB row).
  const handlePrivateUpload = async (files: FileList | null) => {
    if (!files || !files.length || !user) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      const path = `${user.id}/${crypto.randomUUID()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("my-documents").upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) { toast.error(`Upload failed: ${file.name}`); continue; }
    }
    setUploading(false);
    toast.success("Added to your private documents");
    if (privateInput.current) privateInput.current.value = "";
    loadPrivate();
  };

  const download = async (bucket: "client-documents" | "my-documents", path: string) => {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60);
    if (error || !data) { toast.error("Couldn't open file"); return; }
    window.open(data.signedUrl, "_blank");
  };

  // Advocate-only: delete a client document (DB row + storage object).
  // Clients deliberately cannot delete or rename — record integrity is preserved
  // and only advocate/admin can correct a wrong upload.
  const deleteClientDoc = async (d: DocRow) => {
    if (!confirm(`Delete "${d.name}"? This cannot be undone.`)) return;
    await supabase.storage.from("client-documents").remove([d.storage_path]);
    const { error } = await supabase.from("documents").delete().eq("id", d.id);
    if (error) { toast.error("Couldn't delete"); return; }
    toast.success("Deleted");
    load();
  };

  const deletePrivate = async (path: string) => {
    if (!confirm("Delete this private file?")) return;
    const { error } = await supabase.storage.from("my-documents").remove([path]);
    if (error) { toast.error("Couldn't delete"); return; }
    toast.success("Deleted");
    loadPrivate();
  };

  const renderClientDocCard = (d: DocRow) => {
    const isImage = (d.mime_type ?? "").startsWith("image/");
    const Icon = isImage ? FileImage : FileText;
    const owner = profiles[d.client_id];
    return (
      <div key={d.id} className="glass-card p-5 hover:shadow-float transition-calm">
        <div className="h-32 rounded-2xl bg-gradient-sky flex items-center justify-center mb-4 relative">
          <Icon className="h-12 w-12 text-primary opacity-70" />
          <span className={`absolute top-2 right-2 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${
            d.status === "pending_review" ? "bg-status-overdue/15 text-status-overdue" :
            d.status === "triaged" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
          }`}>
            {d.status === "pending_review" ? <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />Pending</span> :
              d.status === "triaged" ? <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3 w-3" />Triaged</span> : "Archived"}
          </span>
        </div>
        <p className="font-semibold truncate">{d.name}</p>
        <p className="text-xs text-muted-foreground mt-1">{formatSize(d.size_bytes)} · {formatDate(d.created_at)}</p>
        {isAdvocate && owner && <p className="text-xs text-muted-foreground mt-0.5">{owner.full_name || owner.email}</p>}
        <div className="flex gap-2 mt-3">
          <Button variant="ghost" size="sm" className="flex-1 gap-2" onClick={() => download("client-documents", d.storage_path)}>
            <Download className="h-3.5 w-3.5" /> Open
          </Button>
          {isAdvocate && (
            <Button variant="ghost" size="sm" className="gap-1 text-destructive hover:text-destructive" onClick={() => deleteClientDoc(d)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    );
  };

  const renderPrivateCard = (f: PrivateFile) => {
    const isImage = (f.mime ?? "").startsWith("image/");
    const Icon = isImage ? FileImage : FileText;
    return (
      <div key={f.path} className="glass-card p-5 hover:shadow-float transition-calm">
        <div className="h-32 rounded-2xl bg-gradient-sky flex items-center justify-center mb-4 relative">
          <Icon className="h-12 w-12 text-primary opacity-70" />
          <span className="absolute top-2 right-2 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-accent/20 text-accent-foreground inline-flex items-center gap-1">
            <Lock className="h-3 w-3" />Private
          </span>
        </div>
        <p className="font-semibold truncate">{f.name.replace(/^[0-9a-f-]+-/, "")}</p>
        <p className="text-xs text-muted-foreground mt-1">{formatSize(f.size)} · {formatDate(f.created_at)}</p>
        <div className="flex gap-2 mt-3">
          <Button variant="ghost" size="sm" className="flex-1 gap-2" onClick={() => download("my-documents", f.path)}>
            <Download className="h-3.5 w-3.5" /> Open
          </Button>
          <Button variant="ghost" size="sm" className="gap-1 text-destructive hover:text-destructive" onClick={() => deletePrivate(f.path)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    );
  };

  if (!isAdvocate) {
    const myDocs = docs.filter(d => d.visibility === "shared");
    return (
      <AppShell role="client" title="Documents" subtitle="Drop in scans, results, anything — we'll keep it safe.">
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); handleClientFiles(e.dataTransfer.files); }}
          className={`glass-card p-10 text-center mb-6 border-2 border-dashed transition-calm ${drag ? "border-primary bg-primary/5" : "border-border"}`}
        >
          <div className="inline-flex h-16 w-16 rounded-3xl bg-gradient-ocean items-center justify-center shadow-soft mb-4">
            {uploading ? <Loader2 className="h-7 w-7 text-primary-foreground animate-spin" /> : <UploadCloud className="h-7 w-7 text-primary-foreground" />}
          </div>
          <h2 className="font-display text-2xl text-primary-deep">Upload a document</h2>
          <p className="text-muted-foreground mt-1 mb-5">Drag & drop, or pick a file. PDFs, images, scans — all welcome.</p>
          <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => handleClientFiles(e.target.files)} />
          <Button onClick={() => fileInput.current?.click()} disabled={uploading} className="rounded-2xl h-12 px-6 bg-gradient-ocean shadow-soft">
            {uploading ? "Uploading..." : "Choose file"}
          </Button>
        </div>

        {myDocs.length === 0 ? (
          <div className="glass-card p-10 text-center text-muted-foreground">No documents yet.</div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{myDocs.map(renderClientDocCard)}</div>
        )}
      </AppShell>
    );
  }

  const clientDocs = docs.filter(d => d.visibility === "shared");

  return (
    <AppShell role="advocate" title="Documents" subtitle="Client files plus your own private workspace.">
      <Tabs value={advocateTab} onValueChange={(v) => setAdvocateTab(v as "clients" | "private")}>
        <TabsList className="mb-6">
          <TabsTrigger value="clients">Client documents</TabsTrigger>
          <TabsTrigger value="private" className="gap-1.5"><Lock className="h-3.5 w-3.5" /> My documents</TabsTrigger>
        </TabsList>

        <TabsContent value="clients" className="space-y-6">
          <div className="glass-card p-6">
            <h2 className="font-display text-lg text-primary-deep mb-1">Upload into a client's profile</h2>
            <p className="text-sm text-muted-foreground mb-4">Works even before a client has activated their account — files attach to their record.</p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Select value={selectedClient} onValueChange={setSelectedClient}>
                <SelectTrigger className="rounded-2xl h-12 flex-1"><SelectValue placeholder="Pick a client..." /></SelectTrigger>
                <SelectContent>
                  {clientsList.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.full_name || c.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => handleAdvocateClientUpload(e.target.files)} />
              <Button onClick={() => fileInput.current?.click()} disabled={uploading || !selectedClient} className="rounded-2xl h-12 px-6 bg-gradient-ocean shadow-soft gap-2">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                Upload for client
              </Button>
            </div>
          </div>

          {(() => {
            // Group docs by client_id; include every known client so empty folders show too.
            const groups = new Map<string, DocRow[]>();
            clientsList.forEach(c => groups.set(c.id, []));
            clientDocs.forEach(d => {
              const arr = groups.get(d.client_id) ?? [];
              arr.push(d);
              groups.set(d.client_id, arr);
            });

            if (openFolder) {
              const folderDocs = groups.get(openFolder) ?? [];
              const owner = clientsList.find(c => c.id === openFolder) || profiles[openFolder];
              const ownerName = owner?.full_name || owner?.email || "Client";
              return (
                <div className="space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <button onClick={() => setOpenFolder(null)} className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
                      <ArrowLeft className="h-4 w-4" /> All folders
                    </button>
                    <div className="flex items-center gap-2">
                      <FolderOpen className="h-5 w-5 text-primary" />
                      <h3 className="font-display text-lg text-primary-deep">{ownerName}</h3>
                      <span className="text-xs text-muted-foreground">({folderDocs.length} file{folderDocs.length === 1 ? "" : "s"})</span>
                    </div>
                  </div>
                  <div className="glass-card p-4 bg-secondary/30 flex items-start gap-3">
                    <Mail className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="text-xs text-muted-foreground">
                      <span className="font-semibold text-primary-deep">Email drop-in:</span> forwarded attachments will land here automatically once inbound email is wired up (Phase 5).
                    </div>
                  </div>
                  {folderDocs.length === 0 ? (
                    <div className="glass-card p-10 text-center text-muted-foreground">This folder is empty. Upload a file above to get started.</div>
                  ) : (
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{folderDocs.map(renderClientDocCard)}</div>
                  )}
                </div>
              );
            }

            const folders = Array.from(groups.entries())
              .map(([cid, items]) => {
                const owner = clientsList.find(c => c.id === cid) || profiles[cid];
                return { cid, items, name: owner?.full_name || owner?.email || "Unknown client" };
              })
              .sort((a, b) => a.name.localeCompare(b.name));

            if (folders.length === 0) {
              return <div className="glass-card p-10 text-center text-muted-foreground">No clients yet.</div>;
            }
            return (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {folders.map(f => (
                  <button
                    key={f.cid}
                    onClick={() => setOpenFolder(f.cid)}
                    className="glass-card p-5 text-left hover:shadow-float transition-calm group"
                  >
                    <div className="flex items-start gap-3">
                      <div className="h-12 w-12 rounded-2xl bg-gradient-ocean flex items-center justify-center shrink-0 shadow-soft">
                        <Folder className="h-5 w-5 text-primary-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold truncate">{f.name}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {f.items.length} file{f.items.length === 1 ? "" : "s"}
                          {f.items.some(d => d.status === "pending_review") && (
                            <span className="ml-2 text-status-overdue font-semibold">· pending review</span>
                          )}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-calm mt-1" />
                    </div>
                  </button>
                ))}
              </div>
            );
          })()}
        </TabsContent>

        <TabsContent value="private" className="space-y-6">
          <div className="glass-card p-6 border-2 border-accent/30 bg-accent/5">
            <div className="flex items-center gap-2 mb-1">
              <Lock className="h-4 w-4 text-accent" />
              <h2 className="font-display text-lg text-primary-deep">Your private folder</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4">Only advocates can see this. Clients have zero access to the my-documents space.</p>
            <input ref={privateInput} type="file" multiple className="hidden" onChange={(e) => handlePrivateUpload(e.target.files)} />
            <Button onClick={() => privateInput.current?.click()} disabled={uploading} className="rounded-2xl h-12 px-6 bg-gradient-ocean shadow-soft gap-2">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
              Add private file
            </Button>
          </div>

          {privateDocs.length === 0 ? (
            <div className="glass-card p-10 text-center text-muted-foreground">No private documents yet.</div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{privateDocs.map(renderPrivateCard)}</div>
          )}
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
