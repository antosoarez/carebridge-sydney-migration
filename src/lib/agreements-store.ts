import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AgreementDocument = {
  id: string;
  slug: string;
  title: string;
  body_md: string;
  version: number;
  required: boolean;
  active: boolean;
  sort_order: number;
};

export type AgreementAcceptance = {
  id: string;
  client_id: string;
  document_id: string;
  document_slug: string;
  document_version: number;
  accepted_at: string;
};

export function useAgreements(clientId: string | undefined) {
  const [docs, setDocs] = useState<AgreementDocument[]>([]);
  const [acceptances, setAcceptances] = useState<AgreementAcceptance[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const docsQ = supabase
      .from("agreement_documents")
      .select("*")
      .eq("active", true)
      .order("sort_order", { ascending: true });
    const accQ = clientId
      ? supabase.from("client_agreement_acceptances").select("*").eq("client_id", clientId)
      : null;
    const [{ data: d }, accRes] = await Promise.all([docsQ, accQ ?? Promise.resolve({ data: [] as AgreementAcceptance[] })]);
    setDocs((d as AgreementDocument[]) ?? []);
    setAcceptances(((accRes as { data: AgreementAcceptance[] | null }).data) ?? []);
    setLoading(false);
  }, [clientId]);

  useEffect(() => { reload(); }, [reload]);

  const acceptedDocIds = new Set(acceptances.map((a) => a.document_id));
  const requiredDocs = docs.filter((d) => d.required);
  const allRequiredAccepted = requiredDocs.every((d) => acceptedDocIds.has(d.id));

  const accept = useCallback(async (doc: AgreementDocument, opts?: { notes?: string }) => {
    if (!clientId) return { error: "No client" };
    const { error } = await supabase.from("client_agreement_acceptances").insert({
      client_id: clientId,
      document_id: doc.id,
      document_slug: doc.slug,
      document_version: doc.version,
      accepted_by_user_id: (await supabase.auth.getUser()).data.user?.id ?? null,
      notes: opts?.notes ?? null,
      user_agent: navigator.userAgent.slice(0, 255),
    });
    if (!error) await reload();
    return { error: error?.message ?? null };
  }, [clientId, reload]);

  return { docs, acceptances, acceptedDocIds, requiredDocs, allRequiredAccepted, loading, reload, accept };
}
