import { useEffect, useState, useMemo } from "react";
import { useClients } from "./clients-store";

export type MessageSender = "client" | "advocate";

export interface Message {
  id: string;
  sender: MessageSender;
  text: string;
  at: string;
}

export interface PendingQuestion {
  id: string;
  text: string;
  askedAt: string;
}

const KEY = "oceanpath.threads.v2";
const SEEN_KEY = "oceanpath.lastSeen.v2";

interface Store { threads: Record<string, Message[]>; pending: Record<string, PendingQuestion[]>; }
type SeenMap = Record<string, string>;

function read(): Store {
  if (typeof window === "undefined") return { threads: {}, pending: {} };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { threads: {}, pending: {} };
    return JSON.parse(raw) as Store;
  } catch {
    return { threads: {}, pending: {} };
  }
}

function write(store: Store) {
  localStorage.setItem(KEY, JSON.stringify(store));
  window.dispatchEvent(new CustomEvent("oceanpath:threads"));
}

function readSeen(): SeenMap {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || "{}"); } catch { return {}; }
}

function writeSeen(map: SeenMap) {
  localStorage.setItem(SEEN_KEY, JSON.stringify(map));
  window.dispatchEvent(new CustomEvent("oceanpath:seen"));
}

export function markThreadRead(viewerRole: MessageSender, clientId: string) {
  const seen = readSeen();
  seen[`${viewerRole}:${clientId}`] = new Date().toISOString();
  writeSeen(seen);
}

function useStore() {
  const [store, setStore] = useState<Store>(() => read());
  const [seen, setSeen] = useState<SeenMap>(() => readSeen());
  useEffect(() => {
    const refreshAll = () => { setStore(read()); setSeen(readSeen()); };
    window.addEventListener("oceanpath:threads", refreshAll);
    window.addEventListener("oceanpath:seen", refreshAll);
    window.addEventListener("storage", refreshAll);
    return () => {
      window.removeEventListener("oceanpath:threads", refreshAll);
      window.removeEventListener("oceanpath:seen", refreshAll);
      window.removeEventListener("storage", refreshAll);
    };
  }, []);
  return { store, seen };
}

export function useThread(clientId: string) {
  const { store } = useStore();
  const messages = store.threads[clientId] ?? [];
  return {
    messages,
    send: (sender: MessageSender, text: string) => {
      const cur = read();
      const msg: Message = { id: `m_${Date.now()}`, sender, text, at: new Date().toISOString() };
      const next: Store = { ...cur, threads: { ...cur.threads, [clientId]: [...(cur.threads[clientId] ?? []), msg] } };
      write(next);
    },
  };
}

export interface ThreadSummary {
  clientId: string;
  name: string;
  avatarColor: string;
  lastMessage?: Message;
  unreadFromClient: number;
  pendingCount: number;
}

export function useThreadSummaries(): ThreadSummary[] {
  const { store, seen } = useStore();
  const { clients } = useClients();
  return clients.map((c) => {
    const msgs = store.threads[c.id] ?? [];
    const last = msgs[msgs.length - 1];
    const seenAt = seen[`advocate:${c.id}`];
    const seenTime = seenAt ? +new Date(seenAt) : 0;
    const unread = msgs.filter((m) => m.sender === "client" && +new Date(m.at) > seenTime).length;
    return {
      clientId: c.id,
      name: c.name,
      avatarColor: c.avatarColor,
      lastMessage: last,
      unreadFromClient: unread,
      pendingCount: (store.pending[c.id] ?? []).length,
    };
  }).sort((a, b) => {
    const at = a.lastMessage ? +new Date(a.lastMessage.at) : 0;
    const bt = b.lastMessage ? +new Date(b.lastMessage.at) : 0;
    return bt - at;
  });
}

export function useUnreadTotal(viewerRole: MessageSender, clientId?: string): number {
  const { store, seen } = useStore();
  return useMemo(() => {
    if (viewerRole === "advocate") {
      return Object.entries(store.threads).reduce((sum, [cid, msgs]) => {
        const t = seen[`advocate:${cid}`] ? +new Date(seen[`advocate:${cid}`]) : 0;
        return sum + msgs.filter((m) => m.sender === "client" && +new Date(m.at) > t).length;
      }, 0);
    }
    if (!clientId) return 0;
    const t = seen[`client:${clientId}`] ? +new Date(seen[`client:${clientId}`]) : 0;
    const msgs = store.threads[clientId] ?? [];
    return msgs.filter((m) => m.sender === "advocate" && +new Date(m.at) > t).length;
  }, [store, seen, viewerRole, clientId]);
}

export function getPendingQuestions(clientId: string): PendingQuestion[] {
  return read().pending[clientId] ?? [];
}
