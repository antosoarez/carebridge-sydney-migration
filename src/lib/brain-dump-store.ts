import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";

export type ThoughtKind = "thought" | "task" | "reminder" | "question" | "note";

export interface Thought {
  id: string;
  text: string;
  createdAt: string;
  author: "client" | "advocate";
  kind: ThoughtKind;
  converted?: boolean;
}

const KEY_PREFIX = "oceanpath.thoughts.v2.";

function keyFor(userId: string | null | undefined): string | null {
  if (!userId) return null;
  return `${KEY_PREFIX}${userId}`;
}

function read(userId: string | null | undefined): Thought[] {
  if (typeof window === "undefined") return [];
  const key = keyFor(userId);
  if (!key) return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    return JSON.parse(raw) as Thought[];
  } catch {
    return [];
  }
}

function write(userId: string | null | undefined, items: Thought[]) {
  const key = keyFor(userId);
  if (!key) return;
  localStorage.setItem(key, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent("oceanpath:thoughts"));
}

/** Remove brain-dump data for a specific user (called on sign-out). */
export function clearThoughts(userId: string | null | undefined) {
  const key = keyFor(userId);
  if (!key || typeof window === "undefined") return;
  localStorage.removeItem(key);
  window.dispatchEvent(new CustomEvent("oceanpath:thoughts"));
}

/** One-time cleanup of any legacy unscoped key from older versions. */
function purgeLegacy() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem("oceanpath.thoughts.v1");
  } catch {
    /* ignore */
  }
}

export function useThoughts(author?: "client" | "advocate") {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [items, setItems] = useState<Thought[]>(() => {
    purgeLegacy();
    return read(userId);
  });

  useEffect(() => {
    setItems(read(userId));
    const refresh = () => setItems(read(userId));
    window.addEventListener("oceanpath:thoughts", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("oceanpath:thoughts", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [userId]);

  const filtered = useMemo(
    () => (author ? items.filter((t) => t.author === author) : items),
    [items, author]
  );

  return {
    thoughts: filtered.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    add: (text: string, addAuthor: "client" | "advocate") => {
      if (!userId) return;
      const next: Thought = {
        id: `th_${Date.now()}`,
        text,
        createdAt: new Date().toISOString(),
        author: addAuthor,
        kind: "thought",
      };
      write(userId, [next, ...items]);
    },
    convert: (id: string, kind: ThoughtKind) => {
      if (!userId) return;
      write(userId, items.map((t) => (t.id === id ? { ...t, kind, converted: true } : t)));
    },
    remove: (id: string) => {
      if (!userId) return;
      write(userId, items.filter((t) => t.id !== id));
    },
  };
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - +new Date(iso);
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}
