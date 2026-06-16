import { useEffect, useState, useRef, useCallback } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/ocean/AppShell";
import { InboundInbox } from "@/components/ocean/InboundInbox";
import { ClientAvatar } from "@/components/ocean/ClientAvatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";
import { ArrowLeft, MessageCircle, Send, Check, CheckCheck, Paperclip, X, FileText, Download } from "lucide-react";
import { formatDistanceToNow, format, isToday, isYesterday } from "date-fns";
import type { ClientColourKey } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useUnreadMessages, markThreadRead } from "@/lib/use-unread-messages";
import {
  validateAttachment,
  uploadAttachment,
  getSignedUrl,
  useMessageAttachments,
  isImage,
  formatBytes,
  type MessageAttachment,
} from "@/lib/attachments-store";

// ---------- types ----------
type Thread = {
  id: string;
  client_id: string;
  advocate_id: string;
  last_message_at: string | null;
  created_at: string;
};

type Message = {
  id: string;
  thread_id: string;
  sender_id: string;
  sender_role: "advocate" | "client";
  body: string;
  created_at: string;
  read_at: string | null;
};

type ClientLite = {
  id: string;
  full_name: string | null;
  email: string;
  client_colour: ClientColourKey;
};

const POLL_MS = 10_000;

function formatBubbleTime(iso: string) {
  const d = new Date(iso);
  if (isToday(d)) return format(d, "h:mm a").toLowerCase();
  if (isYesterday(d)) return `Yesterday, ${format(d, "h:mm a").toLowerCase()}`;
  return format(d, "d MMM, h:mm a").toLowerCase();
}

function formatInboxRelative(iso: string | null) {
  if (!iso) return "No messages yet";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

// ============================================================
// Thread view (shared by client + advocate)
// ============================================================
function ThreadView({
  threadId,
  currentUserId,
  viewerRole,
  otherParty,
  headerBack,
}: {
  threadId: string;
  currentUserId: string;
  viewerRole: "advocate" | "client";
  otherParty: { name: string; colourKey?: ClientColourKey } | null;
  headerBack?: { to: string; label: string };
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastCountRef = useRef(0);
  const messageIds = messages.map((m) => m.id);
  const { byMessage: attachmentsByMessage, reload: reloadAttachments } =
    useMessageAttachments(messageIds);

  const fetchMessages = useCallback(async () => {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("messages fetch", error);
      return;
    }
    setMessages((data as Message[]) ?? []);
    setLoading(false);
    // Mark other-party unread messages as read.
    const hasUnreadFromOther = (data as Message[] | null)?.some(
      (m) => !m.read_at && m.sender_id !== currentUserId
    );
    if (hasUnreadFromOther) {
      markThreadRead(threadId).catch(() => {});
    }
  }, [threadId, currentUserId]);

  // initial load + polling
  useEffect(() => {
    fetchMessages();
    const t = setInterval(fetchMessages, POLL_MS);
    return () => clearInterval(t);
  }, [fetchMessages]);

  // auto-scroll to bottom on new messages
  useEffect(() => {
    if (messages.length !== lastCountRef.current) {
      lastCountRef.current = messages.length;
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
      });
    }
  }, [messages]);

  const handleSend = async () => {
    const body = draft.trim();
    if ((!body && pendingFiles.length === 0) || sending) return;
    setSending(true);
    const { data, error } = await supabase
      .from("messages")
      .insert({
        thread_id: threadId,
        sender_id: currentUserId,
        sender_role: viewerRole, // trigger will overwrite anyway
        body: body || "📎 Attachment",
      })
      .select("*")
      .single();
    if (error || !data) {
      setSending(false);
      toast({
        title: "Couldn't send",
        description: error?.message ?? "Please try again in a moment.",
        variant: "destructive",
      });
      return;
    }
    const newMsg = data as Message;

    // Upload attachments (if any) tied to the new message
    if (pendingFiles.length > 0) {
      const failures: string[] = [];
      for (const file of pendingFiles) {
        const res = await uploadAttachment({
          threadId,
          messageId: newMsg.id,
          uploaderId: currentUserId,
          file,
        });
        if (res.error) failures.push(res.error);
      }
      if (failures.length > 0) {
        toast({
          title: "Some attachments didn't upload",
          description: failures.join(" "),
          variant: "destructive",
        });
      }
      reloadAttachments();
    }

    setSending(false);
    setDraft("");
    setPendingFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setMessages((prev) =>
      prev.some((m) => m.id === newMsg.id) ? prev : [...prev, newMsg]
    );
  };

  const handleFilesPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const accepted: File[] = [];
    const rejected: string[] = [];
    for (const f of files) {
      const v = validateAttachment(f);
      if (v.ok) accepted.push(f);
      else rejected.push(v.reason);
    }
    if (rejected.length > 0) {
      toast({
        title: "Some files were skipped",
        description: rejected.join(" "),
        variant: "destructive",
      });
    }
    setPendingFiles((prev) => [...prev, ...accepted]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removePending = (idx: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const empty = !loading && messages.length === 0;

  return (
    <div className="glass-card overflow-hidden flex flex-col h-[calc(100vh-13rem)] min-h-[480px] max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-border/40 bg-gradient-card">
        {headerBack && (
          <Link
            to={headerBack.to}
            aria-label={headerBack.label}
            className="h-10 w-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20 transition-calm shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
        )}
        {otherParty && (
          <>
            <ClientAvatar
              name={otherParty.name}
              gradient="from-primary to-primary-glow"
              colourKey={otherParty.colourKey}
              size="md"
            />
            <div className="min-w-0">
              <p className="font-display text-base text-primary-deep truncate">{otherParty.name}</p>
              <p className="text-xs text-muted-foreground">
                {viewerRole === "advocate" ? "Client" : "Advocate"}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5 space-y-3 bg-background/40">
        {loading && (
          <p className="text-center text-sm text-muted-foreground py-8">Loading messages…</p>
        )}
        {empty && (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <div className="h-14 w-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-3">
              <MessageCircle className="h-6 w-6" />
            </div>
            <p className="font-display text-lg text-primary-deep">
              {viewerRole === "client" ? "Start the conversation 🌊" : "No messages yet"}
            </p>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs">
              {viewerRole === "client"
                ? otherParty?.name
                  ? `${otherParty.name} is here whenever you're ready.`
                  : "Your advocate is here whenever you're ready."
                : "Say hello to start this conversation."}
            </p>
          </div>
        )}
        {(() => {
          // Find the most recent own message that's been read — show "Seen" only on it.
          let lastSeenMineId: string | null = null;
          for (let i = messages.length - 1; i >= 0; i--) {
            const m = messages[i];
            if (m.sender_id === currentUserId && m.read_at) {
              lastSeenMineId = m.id;
              break;
            }
          }
          return messages.map((m) => {
            const mine = m.sender_id === currentUserId;
            const showSeen = mine && m.id === lastSeenMineId;
            return (
              <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[80%] flex flex-col gap-1.5", mine ? "items-end" : "items-start")}>
                  {m.body && m.body !== "📎 Attachment" && (
                    <div
                      className={cn(
                        "rounded-2xl px-4 py-2.5 shadow-soft whitespace-pre-wrap break-words text-sm leading-relaxed",
                        mine
                          ? "bg-primary text-primary-foreground rounded-br-md"
                          : "bg-card text-foreground border border-border/40 rounded-bl-md"
                      )}
                    >
                      {m.body}
                    </div>
                  )}
                  <AttachmentList
                    attachments={attachmentsByMessage.get(m.id) ?? []}
                    mine={mine}
                  />
                  <span className="text-[10px] text-muted-foreground/80 mt-0.5 px-1 flex items-center gap-1">
                    {formatBubbleTime(m.created_at)}
                    {mine && (
                      showSeen ? (
                        <span className="text-success/80 inline-flex items-center gap-0.5" aria-label="Seen">
                          <CheckCheck className="h-3 w-3" /> Seen
                        </span>
                      ) : mine ? (
                        <Check className="h-3 w-3 text-muted-foreground/60" aria-label="Sent" />
                      ) : null
                    )}
                  </span>
                </div>
              </div>
            );
          });
        })()}
      </div>

      {/* Composer */}
      <div className="border-t border-border/40 p-3 bg-card/60 backdrop-blur-sm">
        {pendingFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {pendingFiles.map((f, i) => (
              <div
                key={`${f.name}-${i}`}
                className="flex items-center gap-2 rounded-xl bg-secondary/60 border border-border/40 px-2.5 py-1.5 text-xs"
              >
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="max-w-[160px] truncate" title={f.name}>{f.name}</span>
                <span className="text-muted-foreground">{formatBytes(f.size)}</span>
                <button
                  type="button"
                  onClick={() => removePending(i)}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  aria-label={`Remove ${f.name}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFilesPicked}
            accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Attach a file"
            className="h-12 w-12 rounded-2xl shrink-0"
            disabled={sending}
          >
            <Paperclip className="h-5 w-5" />
          </Button>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Write a message…"
            rows={1}
            className="flex-1 resize-none rounded-2xl bg-background/80 min-h-[48px] max-h-40 text-base"
            aria-label="Message"
          />
          <Button
            onClick={handleSend}
            disabled={(!draft.trim() && pendingFiles.length === 0) || sending}
            size="icon"
            aria-label="Send message"
            className="h-12 w-12 rounded-2xl shrink-0"
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------- Attachment rendering ----------
function AttachmentList({
  attachments,
  mine,
}: {
  attachments: MessageAttachment[];
  mine: boolean;
}) {
  if (attachments.length === 0) return null;
  return (
    <div className={cn("flex flex-col gap-1.5", mine ? "items-end" : "items-start")}>
      {attachments.map((a) =>
        isImage(a.content_type) ? (
          <AttachmentImage key={a.id} attachment={a} />
        ) : (
          <AttachmentFile key={a.id} attachment={a} mine={mine} />
        )
      )}
    </div>
  );
}

function AttachmentImage({ attachment }: { attachment: MessageAttachment }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    getSignedUrl(attachment.storage_path).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [attachment.storage_path]);
  if (!url) {
    return (
      <div className="h-32 w-44 rounded-2xl bg-secondary/40 animate-pulse" aria-label="Loading image" />
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-2xl overflow-hidden shadow-soft border border-border/40 max-w-[240px]"
      aria-label={`Open ${attachment.filename}`}
    >
      <img
        src={url}
        alt={attachment.filename}
        className="block max-h-64 w-auto object-cover"
        loading="lazy"
      />
    </a>
  );
}

function AttachmentFile({
  attachment,
  mine,
}: {
  attachment: MessageAttachment;
  mine: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const handleClick = async () => {
    setBusy(true);
    const url = await getSignedUrl(attachment.storage_path);
    setBusy(false);
    if (!url) {
      toast({ title: "Couldn't open file", description: "Please try again.", variant: "destructive" });
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className={cn(
        "flex items-center gap-2 rounded-2xl px-3 py-2 text-sm shadow-soft border transition-calm max-w-[280px]",
        mine
          ? "bg-primary/10 border-primary/30 text-primary-deep hover:bg-primary/15"
          : "bg-card border-border/40 text-foreground hover:bg-secondary/40"
      )}
    >
      <FileText className="h-4 w-4 shrink-0" />
      <span className="flex-1 min-w-0 truncate text-left" title={attachment.filename}>
        {attachment.filename}
      </span>
      <span className="text-[10px] text-muted-foreground shrink-0">
        {formatBytes(attachment.size_bytes)}
      </span>
      <Download className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    </button>
  );
}

// ============================================================
// Client side — opens own thread directly
// ============================================================
function ClientMessagesPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [advocate, setAdvocate] = useState<{ name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [bannerDismissedAt, setBannerDismissedAt] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) {
        setLoading(false);
        return;
      }
      setUserId(uid);

      const [{ data: t }, { data: prof }] = await Promise.all([
        supabase.from("message_threads").select("*").eq("client_id", uid).maybeSingle(),
        supabase.from("profiles").select("messages_banner_dismissed_at").eq("id", uid).maybeSingle(),
      ]);

      if (t) {
        setThread(t as Thread);
        const { data: adv } = await supabase.rpc("get_my_advocate").maybeSingle();
        const a = adv as { full_name: string | null; email: string | null } | null;
        setAdvocate({ name: (a?.full_name?.trim() || a?.email || "Advocate") });
      }
      setBannerDismissedAt((prof as any)?.messages_banner_dismissed_at ?? null);
      setLoading(false);
    })();
  }, []);

  const dismissBanner = async () => {
    if (!userId) return;
    const now = new Date().toISOString();
    setBannerDismissedAt(now); // optimistic
    const { error } = await supabase
      .from("profiles")
      .update({ messages_banner_dismissed_at: now })
      .eq("id", userId);
    if (error) {
      console.error("dismiss banner failed", error);
      setBannerDismissedAt(null);
    }
  };

  const showBanner = !loading && bannerDismissedAt === null;

  return (
    <AppShell role="client" title="Messages" subtitle="A calm, supportive space.">
      {showBanner && (
        <div className="mb-4 max-w-3xl mx-auto rounded-3xl bg-[#eef4f0] border border-[#cdddc9] shadow-soft px-4 sm:px-5 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <p className="text-sm leading-relaxed text-[#1C2B3A] flex-1">
              <span aria-hidden="true" className="mr-1">🌊</span>
              Messages are the easiest way to reach your advocate. If you don't check messages for a couple of days, your advocate may reach out by phone or other means to check in — they're here to support you.
            </p>
            <button
              onClick={dismissBanner}
              className="shrink-0 self-stretch sm:self-auto rounded-full bg-white/80 hover:bg-white text-[#1C2B3A] text-sm font-medium px-4 py-2.5 border border-[#cdddc9] transition-colors"
              aria-label="Dismiss this message"
            >
              Got it 🌊
            </button>
          </div>
        </div>
      )}
      {loading && (
        <div className="glass-card p-10 text-center text-muted-foreground">Loading your conversation…</div>
      )}
      {!loading && !thread && (
        <div className="glass-card p-10 text-center max-w-xl mx-auto">
          <div className="inline-flex h-12 w-12 rounded-2xl bg-primary/10 text-primary items-center justify-center mb-3">
            <MessageCircle className="h-6 w-6" />
          </div>
          <p className="font-display text-lg text-primary-deep">Your conversation isn't ready yet</p>
          <p className="text-sm text-muted-foreground mt-2">
            Once your account is fully activated, your direct line to your advocate appears here.
          </p>
        </div>
      )}
      {!loading && thread && userId && (
        <ThreadView
          threadId={thread.id}
          currentUserId={userId}
          viewerRole="client"
          otherParty={advocate ? { name: advocate.name } : null}
        />
      )}
    </AppShell>
  );
}

// ============================================================
// Advocate inbox
// ============================================================
type InboxRow = {
  thread: Thread;
  client: ClientLite | null;
  preview: string | null;
  preview_at: string | null;
};

function AdvocateInbox({ onOpen }: { onOpen: (threadId: string) => void }) {
  const [rows, setRows] = useState<InboxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const { byThread: unreadByThread } = useUnreadMessages();

  const load = useCallback(async () => {
    const { data: threads, error } = await supabase
      .from("message_threads")
      .select("*")
      .order("last_message_at", { ascending: false, nullsFirst: false });
    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }
    const tList = (threads ?? []) as Thread[];
    const clientIds = tList.map((t) => t.client_id);

    const [{ data: profiles }, { data: latest }] = await Promise.all([
      clientIds.length
        ? supabase
            .from("profiles")
            .select("id, full_name, email, client_colour")
            .in("id", clientIds)
        : Promise.resolve({ data: [] as any[] }),
      tList.length
        ? supabase
            .from("messages")
            .select("thread_id, body, created_at")
            .in("thread_id", tList.map((t) => t.id))
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const byClient = new Map<string, ClientLite>();
    (profiles ?? []).forEach((p: any) => byClient.set(p.id, p as ClientLite));

    const previewByThread = new Map<string, { body: string; created_at: string }>();
    (latest ?? []).forEach((m: any) => {
      if (!previewByThread.has(m.thread_id)) {
        previewByThread.set(m.thread_id, { body: m.body, created_at: m.created_at });
      }
    });

    setRows(
      tList.map((t) => {
        const p = previewByThread.get(t.id);
        return {
          thread: t,
          client: byClient.get(t.client_id) ?? null,
          preview: p?.body ?? null,
          preview_at: p?.created_at ?? t.last_message_at,
        };
      })
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  if (loading) {
    return <div className="glass-card p-10 text-center text-muted-foreground">Loading conversations…</div>;
  }

  const visibleRows = unreadOnly
    ? rows.filter((r) => (unreadByThread.get(r.thread.id) ?? 0) > 0)
    : rows;
  const totalUnread = rows.reduce((n, r) => n + ((unreadByThread.get(r.thread.id) ?? 0) > 0 ? 1 : 0), 0);

  const filterBar = (
    <div className="flex items-center gap-2 mb-3">
      <button
        type="button"
        onClick={() => setUnreadOnly(false)}
        className={cn(
          "px-3 py-1.5 rounded-full text-xs font-semibold transition-calm",
          !unreadOnly ? "bg-primary text-primary-foreground shadow-soft" : "bg-secondary text-muted-foreground"
        )}
      >
        All ({rows.length})
      </button>
      <button
        type="button"
        onClick={() => setUnreadOnly(true)}
        className={cn(
          "px-3 py-1.5 rounded-full text-xs font-semibold transition-calm",
          unreadOnly ? "bg-success text-success-foreground shadow-soft" : "bg-secondary text-muted-foreground"
        )}
      >
        Unread ({totalUnread})
      </button>
    </div>
  );

  if (rows.length === 0) {
    return (
      <div className="glass-card p-10 text-center">
        <MessageCircle className="h-10 w-10 mb-3 text-primary/50 mx-auto" />
        <p className="font-display text-lg text-primary-deep">No conversations yet</p>
        <p className="text-sm text-muted-foreground mt-1">Client threads will appear here.</p>
      </div>
    );
  }

  return (
    <div>
      {filterBar}
      {visibleRows.length === 0 ? (
        <div className="glass-card p-8 text-center text-muted-foreground text-sm">
          No unread conversations — you're all caught up 🌊
        </div>
      ) : (
        <div className="space-y-2">
          {visibleRows.map((row) => {
            const name = row.client?.full_name || row.client?.email || "Client";
            const unread = unreadByThread.get(row.thread.id) ?? 0;
            const hasUnread = unread > 0;
            const preview = row.preview
              ? row.preview.length > 80
                ? row.preview.slice(0, 80) + "…"
                : row.preview
              : "No messages yet — say hello.";
            return (
              <button
                key={row.thread.id}
                onClick={() => onOpen(row.thread.id)}
                className={cn(
                  "w-full text-left glass-card p-4 flex items-center gap-3 hover:shadow-soft hover:-translate-y-0.5 transition-calm",
                  hasUnread && "ring-1 ring-success/40 bg-success/5"
                )}
              >
                <ClientAvatar
                  name={name}
                  gradient="from-primary to-primary-glow"
                  colourKey={row.client?.client_colour}
                  size="md"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className={cn("font-display text-base text-primary-deep truncate flex items-center gap-2", hasUnread && "font-semibold")}>
                      {hasUnread && (
                        <span
                          aria-label={`${unread} unread`}
                          className="h-2 w-2 rounded-full bg-success shrink-0"
                        />
                      )}
                      <span className="truncate">{name}</span>
                    </p>
                    <span className="text-[11px] text-muted-foreground shrink-0">
                      {formatInboxRelative(row.preview_at)}
                    </span>
                  </div>
                  <p
                    className={cn(
                      "text-sm truncate mt-0.5",
                      hasUnread
                        ? "text-foreground font-medium"
                        : row.preview
                          ? "text-foreground/80"
                          : "text-muted-foreground italic"
                    )}
                  >
                    {preview}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AdvocateMessagesPage() {
  const { id: threadIdParam } = useParams();
  const [searchParams] = useSearchParams();
  const enquiryParam = searchParams.get("enquiry");
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [otherParty, setOtherParty] = useState<{ name: string; colourKey?: ClientColourKey } | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const inboxRef = useRef<HTMLElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    if (enquiryParam && inboxRef.current) {
      inboxRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [enquiryParam]);

  useEffect(() => {
    if (!threadIdParam) {
      setOtherParty(null);
      return;
    }
    setThreadLoading(true);
    (async () => {
      const { data: t } = await supabase
        .from("message_threads")
        .select("client_id")
        .eq("id", threadIdParam)
        .maybeSingle();
      if (t?.client_id) {
        const { data: p } = await supabase
          .from("profiles")
          .select("full_name, email, client_colour")
          .eq("id", t.client_id)
          .maybeSingle();
        if (p) {
          setOtherParty({
            name: (p.full_name as string) || (p.email as string) || "Client",
            colourKey: p.client_colour as ClientColourKey,
          });
        }
      }
      setThreadLoading(false);
    })();
  }, [threadIdParam]);

  if (threadIdParam) {
    return (
      <AppShell role="advocate" title="Conversation" subtitle="Calm, direct, one client at a time.">
        {!userId || threadLoading ? (
          <div className="glass-card p-10 text-center text-muted-foreground">Loading…</div>
        ) : (
          <ThreadView
            threadId={threadIdParam}
            currentUserId={userId}
            viewerRole="advocate"
            otherParty={otherParty}
            headerBack={{ to: "/advocate/messages", label: "Back to inbox" }}
          />
        )}
      </AppShell>
    );
  }

  return (
    <AppShell role="advocate" title="Messages" subtitle="Every client conversation in one calm place.">
      <section className="mb-10" aria-labelledby="conversations-heading">
        <h2 id="conversations-heading" className="font-display text-2xl text-primary-deep mb-3">
          Client conversations
        </h2>
        <AdvocateInbox onOpen={(id) => navigate(`/advocate/messages/${id}`)} />
      </section>

      <section aria-labelledby="inbox-heading" ref={inboxRef}>
        <div className="flex items-center justify-between mb-3">
          <h2 id="inbox-heading" className="font-display text-2xl text-primary-deep">
            Public inbox
          </h2>
          <Link to="/contact" className="text-sm font-semibold text-primary-deep hover:underline">
            View contact page →
          </Link>
        </div>
        <InboundInbox focusEnquiryId={enquiryParam} />
      </section>
    </AppShell>
  );
}

export default function Messages({ role = "client" }: { role?: "client" | "advocate" }) {
  return role === "advocate" ? <AdvocateMessagesPage /> : <ClientMessagesPage />;
}
