import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { FileText, FileImage, Download, Trash2, UploadCloud, Loader2 } from "lucide-react";

interface DocRow {
  id: string;
  client_id: string;
  uploaded_by: string;
  name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

function fmtSize(b: number | null) {
  if (!b) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function ClientDocumentsSection({ clientId, canManage }: { clientId: string; canManage: boolean }) {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = async () => {
    const { data } = await supabase
      .from("documents")
      .select("id, client_id, uploaded_by, name, storage_path, mime_type, size_bytes, created_at")
      .eq("client_id", clientId)
      .eq("visibility", "shared")
      .order("created_at", { ascending: true });
    setDocs((data as DocRow[]) ?? []);
  };

  useEffect(() => {
    load();
    const ch = supabase.channel(`docs-${clientId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "documents", filter: `client_id=eq.${clientId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const download = async (path: string) => {
    const { data, error } = await supabase.storage.from("client-documents").createSignedUrl(path, 60);
    if (error || !data) { toast({ title: "Couldn't open file", variant: "destructive" }); return; }
    window.open(data.signedUrl, "_blank");
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files?.length || !canManage) return;
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      const path = `${clientId}/${crypto.randomUUID()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("client-documents").upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) { toast({ title: `Upload failed: ${file.name}`, variant: "destructive" }); continue; }
      const { error: insErr } = await supabase.from("documents").insert({
        client_id: clientId, uploaded_by: uid,
        name: file.name, storage_path: path, mime_type: file.type, size_bytes: file.size,
        status: "triaged", visibility: "shared",
      });
      if (insErr) toast({ title: `Couldn't save record: ${file.name}`, variant: "destructive" });
    }
    setUploading(false);
    if (fileInput.current) fileInput.current.value = "";
    load();
    toast({ title: "Uploaded" });
  };

  const remove = async (d: DocRow) => {
    if (!confirm(`Remove "${d.name}"?`)) return;
    await supabase.storage.from("client-documents").remove([d.storage_path]);
    const { error } = await supabase.from("documents").delete().eq("id", d.id);
    if (error) { toast({ title: "Couldn't remove", variant: "destructive" }); return; }
    load();
  };

  return (
    <section className="glass-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <FileText className="h-4 w-4 text-primary" />
        <h2 className="font-display text-xl text-primary-deep">Documents</h2>
        <span className="text-xs text-muted-foreground">Test results, letters, scans</span>
        {canManage && (
          <div className="ml-auto">
            <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => handleUpload(e.target.files)} />
            <Button size="sm" variant="outline" className="rounded-full" onClick={() => fileInput.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <UploadCloud className="h-4 w-4 mr-1.5" />}
              Upload
            </Button>
          </div>
        )}
      </div>

      {docs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No documents yet. Uploaded files will appear here, oldest first.</p>
      ) : (
        <ul className="space-y-2">
          {docs.map((d) => {
            const isImg = (d.mime_type ?? "").startsWith("image/");
            const Icon = isImg ? FileImage : FileText;
            return (
              <li key={d.id} className="flex items-center gap-3 p-3 rounded-2xl bg-secondary/40">
                <div className="h-10 w-10 rounded-xl bg-gradient-ocean flex items-center justify-center shrink-0">
                  <Icon className="h-4 w-4 text-primary-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{d.name}</p>
                  <p className="text-xs text-muted-foreground">{fmtSize(d.size_bytes)} · {fmtDate(d.created_at)} · by {d.uploaded_by === clientId ? "client" : "advocate"}</p>
                </div>
                <Button size="sm" variant="ghost" className="rounded-full" onClick={() => download(d.storage_path)}>
                  <Download className="h-4 w-4" />
                </Button>
                {canManage && (
                  <Button size="sm" variant="ghost" className="rounded-full text-muted-foreground hover:text-destructive" onClick={() => remove(d)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
