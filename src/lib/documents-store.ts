import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DocItem, fileSize } from "@/lib/types";

export function useDocuments(clientId?: string): { documents: DocItem[]; loading: boolean } {
  const [documents, setDocuments] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let q = supabase
        .from("documents")
        .select("id, client_id, name, uploaded_by, created_at, size_bytes, mime_type")
        .order("created_at", { ascending: false });
      if (clientId) q = q.eq("client_id", clientId);
      const { data } = await q;
      if (cancelled) return;
      setDocuments((data ?? []).map((d) => ({
        id: d.id,
        clientId: d.client_id,
        name: d.name,
        uploadedBy: d.uploaded_by === clientId ? "client" : "advocate",
        uploadedAt: d.created_at,
        size: fileSize(d.size_bytes),
        type: d.mime_type ?? "file",
      })));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  return { documents, loading };
}
