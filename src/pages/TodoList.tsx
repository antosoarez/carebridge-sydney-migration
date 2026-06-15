import { useEffect } from "react";
import { markSectionViewed } from "@/lib/attention-badges";
import { AppShell } from "@/components/ocean/AppShell";
import { ClientTasksPanel } from "@/components/ocean/ClientTasksPanel";
import { useAuth } from "@/lib/auth";

export default function TodoList({ role = "client" }: { role?: "client" | "advocate" }) {
  const { user } = useAuth();
  useEffect(() => { markSectionViewed("todo"); }, []);

  return (
    <AppShell
      role={role}
      title="To-do list"
      subtitle="Just the next few things. Add what matters, ignore the rest."
    >
      {user?.id ? (
        <ClientTasksPanel
          clientId={user.id}
          canManage
          subtaskTemplateGroup={role === "advocate" ? "advocate" : "client"}
        />
      ) : (
        <div className="glass-card p-8 text-center text-muted-foreground">Loading…</div>
      )}
    </AppShell>
  );
}
