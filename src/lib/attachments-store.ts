import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const ATTACHMENT_BUCKET = "message-attachments";
const MAX_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB
const SIGNED_URL_TTL_SECONDS = 60;

export const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
]);

export type MessageAttachment = {
  id: string;
  message_id: string;
  thread_id: string;
  uploader_id: string;
  storage_path: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
};

export type ValidateResult = { ok: true; reason?: undefined } | { ok: false; reason: string };

export function validateAttachment(file: File): ValidateResult {
  if (file.size <= 0) return { ok: false, reason: `${file.name} is empty.` };
  if (file.size > MAX_SIZE_BYTES) {
    return { ok: false, reason: `${file.name} is over 25 MB.` };
  }
  // Browsers sometimes leave content_type blank; allow if the extension is image/pdf.
  const mime = file.type || guessMimeFromName(file.name);
  if (!ALLOWED_MIME.has(mime)) {
    return { ok: false, reason: `${file.name}: file type not supported.` };
  }
  return { ok: true };
}

function guessMimeFromName(name: string): string {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "heic":
      return "image/heic";
    case "heif":
      return "image/heif";
    case "gif":
      return "image/gif";
    case "pdf":
      return "application/pdf";
    case "doc":
      return "application/msword";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "xls":
      return "application/vnd.ms-excel";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "txt":
      return "text/plain";
    case "csv":
      return "text/csv";
    default:
      return "application/octet-stream";
  }
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
}

/**
 * Upload a file to the private message-attachments bucket and create the
 * message_attachments row. Caller must already have created the parent
 * message row and have its id + thread_id.
 */
export async function uploadAttachment(params: {
  threadId: string;
  messageId: string;
  uploaderId: string;
  file: File;
}): Promise<{ data: MessageAttachment | null; error: string | null }> {
  const v = validateAttachment(params.file);
  if (!v.ok) return { data: null, error: v.reason };

  const safeName = sanitizeFilename(params.file.name);
  const uuid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  const storagePath = `${params.threadId}/${params.messageId}/${uuid}-${safeName}`;
  const contentType = params.file.type || guessMimeFromName(params.file.name);

  const { error: upErr } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .upload(storagePath, params.file, {
      contentType,
      upsert: false,
    });
  if (upErr) return { data: null, error: upErr.message };

  const { data, error } = await (supabase as any)
    .from("message_attachments")
    .insert({
      message_id: params.messageId,
      thread_id: params.threadId,
      uploader_id: params.uploaderId,
      storage_path: storagePath,
      filename: params.file.name,
      content_type: contentType,
      size_bytes: params.file.size,
    })
    .select("*")
    .single();
  if (error) {
    // Best-effort cleanup of orphaned blob
    await supabase.storage.from(ATTACHMENT_BUCKET).remove([storagePath]).catch(() => {});
    return { data: null, error: error.message };
  }
  return { data: data as MessageAttachment, error: null };
}

/** Create a short-lived signed URL for an attachment storage_path. */
export async function getSignedUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/**
 * Fetch all attachments for a list of message ids. Returns map(messageId → list).
 * Safe when the table doesn't exist yet (returns empty map).
 */
export function useMessageAttachments(
  messageIds: string[],
): { byMessage: Map<string, MessageAttachment[]>; reload: () => void } {
  const [byMessage, setBy] = useState<Map<string, MessageAttachment[]>>(new Map());
  const [nonce, setNonce] = useState(0);
  const key = messageIds.join(",");

  useEffect(() => {
    let cancelled = false;
    if (messageIds.length === 0) {
      setBy(new Map());
      return;
    }
    (async () => {
      const { data, error } = await (supabase as any)
        .from("message_attachments")
        .select("*")
        .in("message_id", messageIds);
      if (cancelled) return;
      if (error) {
        setBy(new Map());
        return;
      }
      const m = new Map<string, MessageAttachment[]>();
      for (const row of (data ?? []) as MessageAttachment[]) {
        const list = m.get(row.message_id) ?? [];
        list.push(row);
        m.set(row.message_id, list);
      }
      setBy(m);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce]);

  return { byMessage, reload: useCallback(() => setNonce((n) => n + 1), []) };
}

export function isImage(contentType: string): boolean {
  return contentType.startsWith("image/");
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export const ATTACHMENT_LIMITS = {
  maxBytes: MAX_SIZE_BYTES,
  bucket: ATTACHMENT_BUCKET,
};
