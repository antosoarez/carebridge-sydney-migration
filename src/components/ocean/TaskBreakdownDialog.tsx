import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { ADVOCATE_TEMPLATES, CLIENT_TEMPLATES, type SubtaskTemplate } from "@/lib/subtask-templates";
import { useSubtasks } from "@/lib/subtasks-store";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentTaskId: string;
  templateGroup: "advocate" | "client";
}

/** Calm template picker for "Break this down" — usable from anywhere. */
export function TaskBreakdownDialog({ open, onOpenChange, parentTaskId, templateGroup }: Props) {
  const { applyTemplate } = useSubtasks(parentTaskId);
  const [busy, setBusy] = useState<string | null>(null);
  const templates: SubtaskTemplate[] = templateGroup === "advocate" ? ADVOCATE_TEMPLATES : CLIENT_TEMPLATES;

  const choose = async (t: SubtaskTemplate) => {
    if (t.items.length === 0) { onOpenChange(false); return; }
    setBusy(t.id);
    try {
      await applyTemplate(t.items);
      toast.success("Broken into smaller steps 🌊", { description: "One at a time — no rush." });
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Couldn't add steps", { description: err?.message ?? "Please try again." });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl text-primary-deep flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-accent" /> Break this down
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-2">
          Pick a starting point. You can edit, add or remove steps after.
        </p>
        <div className="space-y-2 mt-3 max-h-[60vh] overflow-y-auto pr-1">
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => choose(t)}
              disabled={busy !== null}
              className="w-full text-left rounded-2xl border border-primary/15 bg-card hover:bg-primary/5 transition-calm px-4 py-3 disabled:opacity-50"
            >
              <p className="text-sm font-semibold text-primary-deep">{t.title}</p>
              {t.hint && <p className="text-xs text-muted-foreground mt-0.5">{t.hint}</p>}
              <p className="text-xs text-muted-foreground mt-1">
                {t.items.length} {t.items.length === 1 ? "step" : "steps"}
              </p>
            </button>
          ))}
        </div>
        <div className="flex justify-end pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
