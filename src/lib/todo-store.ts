import { useEffect, useState } from "react";

export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  createdAt: string;
}

const keyFor = (role: "client" | "advocate") => `oceanpath.todos.${role}.v1`;

function read(role: "client" | "advocate"): TodoItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(keyFor(role));
    return raw ? (JSON.parse(raw) as TodoItem[]) : [];
  } catch {
    return [];
  }
}

function write(role: "client" | "advocate", items: TodoItem[]) {
  localStorage.setItem(keyFor(role), JSON.stringify(items));
  window.dispatchEvent(new CustomEvent("oceanpath:todos"));
}

export function useTodos(role: "client" | "advocate") {
  const [items, setItems] = useState<TodoItem[]>(() => read(role));

  useEffect(() => {
    const refresh = () => setItems(read(role));
    window.addEventListener("oceanpath:todos", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("oceanpath:todos", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [role]);

  return {
    items: items.sort((a, b) => Number(a.done) - Number(b.done) || +new Date(b.createdAt) - +new Date(a.createdAt)),
    add: (text: string) => {
      const t = text.trim();
      if (!t) return;
      write(role, [{ id: `td_${Date.now()}`, text: t, done: false, createdAt: new Date().toISOString() }, ...items]);
    },
    toggle: (id: string) => write(role, items.map(i => i.id === id ? { ...i, done: !i.done } : i)),
    remove: (id: string) => write(role, items.filter(i => i.id !== id)),
    clearDone: () => write(role, items.filter(i => !i.done)),
  };
}
