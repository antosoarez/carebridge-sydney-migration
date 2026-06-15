import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type TemplateAudience = "patient" | "clinic" | "both";

export interface DocTemplate {
  id: string;
  title: string;
  description: string | null;
  audience: TemplateAudience;
  storage_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

export function useTemplates() {
  const [items, setItems] = useState<DocTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from("document_templates")
      .select("*")
      .order("created_at", { ascending: false });
    setItems((data ?? []) as DocTemplate[]);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const add = useCallback(async (input: {
    title: string;
    description?: string;
    audience: TemplateAudience;
    file?: File | null;
  }) => {
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes.user?.id;
    if (!uid) throw new Error("Not signed in");

    let storage_path: string | null = null;
    let file_name: string | null = null;
    let mime_type: string | null = null;
    let size_bytes: number | null = null;

    if (input.file) {
      const safe = input.file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
      storage_path = `${uid}/${Date.now()}-${safe}`;
      const { error: upErr } = await supabase.storage
        .from("templates")
        .upload(storage_path, input.file, { contentType: input.file.type, upsert: false });
      if (upErr) throw upErr;
      file_name = input.file.name;
      mime_type = input.file.type;
      size_bytes = input.file.size;
    }

    const { error } = await supabase.from("document_templates").insert({
      created_by: uid,
      title: input.title,
      description: input.description ?? null,
      audience: input.audience,
      storage_path,
      file_name,
      mime_type,
      size_bytes,
    });
    if (error) throw error;
    await refresh();
  }, [refresh]);

  const remove = useCallback(async (t: DocTemplate) => {
    if (t.storage_path) {
      await supabase.storage.from("templates").remove([t.storage_path]);
    }
    await supabase.from("document_templates").delete().eq("id", t.id);
    await refresh();
  }, [refresh]);

  const getDownloadUrl = useCallback(async (storage_path: string) => {
    const { data, error } = await supabase.storage
      .from("templates")
      .createSignedUrl(storage_path, 60 * 5);
    if (error) throw error;
    return data.signedUrl;
  }, []);

  return { items, loading, add, remove, getDownloadUrl };
}
