import { Link } from "react-router-dom";
import { AppShell } from "@/components/ocean/AppShell";
import { ArrowLeft } from "lucide-react";

export default function TaskDetail() {
  const role = window.location.pathname.startsWith("/advocate") ? "advocate" : "client";
  return (
    <AppShell role={role} seoTitle="Task not found">
      <Link to={role === "advocate" ? "/advocate" : "/client"} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary mb-6">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>
      <div className="glass-card p-12 text-center max-w-2xl">
        <h1 className="font-display text-2xl text-primary-deep">Task not found</h1>
        <p className="text-sm text-muted-foreground mt-1">Tasks will live here once they're created.</p>
      </div>
    </AppShell>
  );
}
