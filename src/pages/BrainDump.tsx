import { AppShell } from "@/components/ocean/AppShell";
import { useThoughts, relativeTime, type ThoughtKind } from "@/lib/brain-dump-store";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ListTodo, Bell, HelpCircle, StickyNote, Trash2, Waves } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const kindMeta: Record<ThoughtKind, { label: string; icon: typeof ListTodo; color: string }> = {
  thought: { label: "Thought", icon: Waves, color: "text-primary" },
  task: { label: "Task", icon: ListTodo, color: "text-status-progress" },
  reminder: { label: "Reminder", icon: Bell, color: "text-accent" },
  question: { label: "Question", icon: HelpCircle, color: "text-status-waiting" },
  note: { label: "Internal note", icon: StickyNote, color: "text-muted-foreground" },
};

export default function BrainDump({ role = "client" }: { role?: "client" | "advocate" }) {
  const { thoughts, convert, remove } = useThoughts(role);
  const { toast } = useToast();

  const handleConvert = (id: string, kind: ThoughtKind) => {
    convert(id, kind);
    toast({ title: `Converted to ${kindMeta[kind].label.toLowerCase()} 🌊`, description: "Filed away gently. Nothing more for you to do." });
  };

  return (
    <AppShell
      role={role}
      title="Brain Dump"
      subtitle="A safe place to drop anything that's swimming around your head. Sort it later — or never."
    >
      <section className="glass-card p-6 md:p-8 mb-8 bg-gradient-card relative overflow-hidden">
        <div className="absolute -left-10 -bottom-10 h-48 w-48 rounded-full bg-gradient-ocean opacity-10 blur-2xl" />
        <div className="relative flex items-start gap-4">
          <div className="h-12 w-12 rounded-2xl bg-gradient-ocean text-primary-foreground flex items-center justify-center shadow-soft shrink-0">
            <Waves className="h-6 w-6" />
          </div>
          <div>
            <h2 className="font-display text-xl md:text-2xl text-primary-deep">
              Tap the floating wave anytime
            </h2>
            <p className="text-muted-foreground mt-1 text-sm md:text-base">
              Type or hold to record. Your thoughts land here — no labels needed. When you're ready, turn one into a task, reminder, or question.
            </p>
          </div>
        </div>
      </section>

      <div className="space-y-4">
        {thoughts.length === 0 && (
          <div className="glass-card p-10 text-center text-muted-foreground">
            <Waves className="h-8 w-8 mx-auto mb-3 text-primary/60" />
            Nothing here yet. Calm waters.
          </div>
        )}

        {thoughts.map((t) => {
          const Meta = kindMeta[t.kind];
          const Icon = Meta.icon;
          return (
            <article key={t.id} className="glass-card p-5 md:p-6 transition-calm hover:shadow-soft">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className={cn("inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider", Meta.color)}>
                  <Icon className="h-3.5 w-3.5" />
                  {Meta.label}
                  {t.converted && <CheckCircle2 className="h-3.5 w-3.5 ml-1 text-status-completed" />}
                </div>
                <span className="text-xs text-muted-foreground">{relativeTime(t.createdAt)}</span>
              </div>

              <p className="text-base text-primary-deep leading-relaxed text-balance">{t.text}</p>

              <div className="mt-5 pt-4 border-t border-border/60 flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground mr-1">Turn into:</span>
                {(["task", "reminder", "question", "note"] as ThoughtKind[]).map((k) => {
                  const M = kindMeta[k];
                  const KIcon = M.icon;
                  return (
                    <button
                      key={k}
                      onClick={() => handleConvert(t.id, k)}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-calm",
                        t.kind === k
                          ? "bg-primary/10 text-primary"
                          : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-primary-deep"
                      )}
                    >
                      <KIcon className="h-3 w-3" />
                      {M.label}
                    </button>
                  );
                })}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(t.id)}
                  className="ml-auto text-muted-foreground hover:text-destructive gap-1.5 h-8"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Release
                </Button>
              </div>
            </article>
          );
        })}
      </div>
    </AppShell>
  );
}
