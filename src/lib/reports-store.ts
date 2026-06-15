import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ReportStatus = "draft" | "shared_for_review" | "agreed";
export type ReportStage = "draft" | "v1" | "v2" | "v3" | "finalised" | "updated";
export type ReportVisibility = "private" | "shared";

export const REPORT_STAGE_LABELS: Record<ReportStage, string> = {
  draft: "Draft",
  v1: "Report V.1",
  v2: "Report V.2",
  v3: "Report V.3",
  finalised: "Finalised Report",
  updated: "Updated Report",
};

export const REPORT_VISIBILITY_LABELS: Record<ReportVisibility, string> = {
  private: "Private (only you)",
  shared: "Shared (you + client)",
};

export interface ReportItem {
  id: string;
  clientId: string;
  createdBy: string;
  title: string;
  storagePath: string | null;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  status: ReportStatus;
  stage: ReportStage;
  visibility: ReportVisibility;
  sharedAt: string | null;
  clientAgreedAt: string | null;
  clientFeedback: string | null;
  createdAt: string;
}

function mapRow(d: any): ReportItem {
  return {
    id: d.id,
    clientId: d.client_id,
    createdBy: d.created_by,
    title: d.title,
    storagePath: d.storage_path,
    fileName: d.file_name,
    mimeType: d.mime_type,
    sizeBytes: d.size_bytes,
    status: d.status,
    stage: d.stage ?? "draft",
    visibility: d.visibility ?? "private",
    sharedAt: d.shared_at,
    clientAgreedAt: d.client_agreed_at,
    clientFeedback: d.client_feedback,
    createdAt: d.created_at,
  };
}

export function useReports(clientId?: string) {
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!clientId) { setReports([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from("reports")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: true });
    setReports((data ?? []).map(mapRow));
    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    load();
    if (!clientId) return;
    const ch = supabase
      .channel(`reports-${clientId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "reports", filter: `client_id=eq.${clientId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [clientId, load]);

  return { reports, loading, reload: load };
}

export interface ReportComment {
  id: string;
  reportId: string;
  authorId: string;
  authorRole: "advocate" | "client";
  body: string;
  createdAt: string;
}

export function useReportComments(reportId?: string) {
  const [comments, setComments] = useState<ReportComment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!reportId) { setComments([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from("report_comments" as any)
      .select("*")
      .eq("report_id", reportId)
      .order("created_at", { ascending: true });
    setComments(((data as any[]) ?? []).map((d) => ({
      id: d.id, reportId: d.report_id, authorId: d.author_id,
      authorRole: d.author_role, body: d.body, createdAt: d.created_at,
    })));
    setLoading(false);
  }, [reportId]);

  useEffect(() => {
    load();
    if (!reportId) return;
    const ch = supabase
      .channel(`report-comments-${reportId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "report_comments", filter: `report_id=eq.${reportId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [reportId, load]);

  return { comments, loading, reload: load };
}
