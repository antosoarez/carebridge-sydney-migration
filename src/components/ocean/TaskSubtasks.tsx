import { useMemo, useState } from "react";
import { Check, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { useSubtasks, SubtaskRow } from "@/lib/subtasks-store";
import {
  ADVOCATE_TEMPLATES,
  CLIENT_TEMPLATES,
  SUBTASK_ENCOURAGEMENTS,
  SubtaskTemplate,
} from "@/lib/subtask-templates";

interface Props {
  parentTaskId: string;
  /** Which template group to surface in the picker. */
  templateGroup: "advocate" | "client";
  /** Hide management controls (add / edit / delete / templates / mark all). */
  readOnly?: boolean;
}

export function TaskSubtasks({ parentTaskId, templateGroup, readOnly = false }: Props) {
  const { subtasks, loading, add, updateTitle, toggle, remove, markAllDone, applyTemplate } =
    useSubtasks(parentTaskId);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [adding, setAdding] = useState(false);
  const [cascading, setCascading] = useState(false);

  const templates = templateGroup === "advocate" ? ADVOCATE_TEMPLATES : CLIENT_TEMPLATES;

  const total = subtasks.length;
  const doneCount = useMemo(() => subtasks.filter((s) => s.done).length, [subtasks]);
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  const handleToggle = async (s: SubtaskRow) => {
    try {
      await toggle(s);
      if (!s.done && Math.random() < 0.35) {
        const msg = SUBTASK_ENCOURAGEMENTS[Math.floor(Math.random() * SUBTASK_ENCOURAGEMENTS.length)];
        toast({ title: msg });
      }
    } catch (err: any) {
      toast({ title: "Couldn't update", description: err?.message ?? "", variant: "destructive" });
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setAdding(true);
    try {
      await add(newTitle);
      setNewTitle("");
    } catch (err: any) {
      toast({ title: "Couldn't add step", description: err?.message ?? "", variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  const handleSaveEdit = async (id: string) => {
    if (!editingText.trim()) { setEditingId(null); return; }
    try {
      await updateTitle(id, editingText);
      setEditingId(null);
    } catch (err: any) {
      toast({ title: "Couldn't save", description: err?.message ?? "", variant: "destructive" });
    }
  };

  const handleRemove = async (s: SubtaskRow) => {
    try { await remove(s.id); } catch (err: any) {
      toast({ title: "Couldn't remove", description: err?.message ?? "", variant: "destructive" });
    }
  };

  const handleMarkAll = async () => {
    setCascading(true);
    try { await markAllDone(); toast({ title: "All done 🌊" }); }
    catch (err: any) { toast({ title: "Couldn't mark all", description: err?.message ?? "", variant: "destructive" }); }
    finally { setCascading(false); }
  };

  const handlePickTemplate = async (tpl: SubtaskTemplate) => {
    setPickerOpen(false);
    if (tpl.items.length === 0) {
      toast({ title: "Empty — add your own steps below." });
      return;
    }
    try {
      await applyTemplate(tpl.items);
      toast({ title: `Added ${tpl.items.length} steps` });
    } catch (err: any) {
      toast({ title: "Couldn't apply template", description: err?.message ?? "", variant: "destructive" });
    }
  };

  if (loading) {
    return <div className="text-xs text-muted-foreground px-1 py-2">Loading steps…</div>;
  }

  const allDone = total > 0 && doneCount === total;
  const openSubtasks = subtasks.filter((s) => !s.done);

  return (
    <div className="space-y-3">
      {/* Progress + actions row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {total > 0 ? (
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="h-1.5 flex-1 max-w-[180px] rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full bg-gradient-ocean transition-all duration-500 ease-out"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground font-medium whitespace-nowrap">
              {doneCount} of {total} done
            </span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">No steps yet</span>
        )}
        {!readOnly && (
          <div className="flex items-center gap-2">
            {total > 0 && openSubtasks.length > 0 && (
              <Button
                type="button" variant="ghost" size="sm"
                onClick={handleMarkAll}
                disabled={cascading}
                className="h-8 rounded-xl text-xs text-primary hover:bg-primary/10"
              >
                <Check className="h-3.5 w-3.5 mr-1" /> Mark all done
              </Button>
            )}
            <Button
              type="button" variant="ghost" size="sm"
              onClick={() => setPickerOpen(true)}
              className="h-8 rounded-xl text-xs text-primary hover:bg-primary/10"
            >
              <Sparkles className="h-3.5 w-3.5 mr-1" /> Break this down
            </Button>
          </div>
        )}
      </div>

      {/* Subtasks list */}
      {total > 0 && (
        <ul className="space-y-1.5">
          {subtasks.map((s, idx) => (
            <li
              key={s.id}
              className={cn(
                "flex items-start gap-2.5 rounded-2xl bg-background/60 border border-primary/10 px-3 py-2 transition-calm",
                s.done && "opacity-60",
                cascading && !s.done && "animate-pulse"
              )}
              style={cascading ? { animationDelay: `${idx * 100}ms` } : undefined}
            >
              <button
                type="button"
                onClick={() => handleToggle(s)}
                aria-label={s.done ? "Mark not done" : "Mark done"}
                className={cn(
                  "shrink-0 mt-0.5 h-6 w-6 rounded-lg border-2 flex items-center justify-center transition-calm",
                  s.done
                    ? "bg-gradient-ocean border-transparent shadow-soft"
                    : "border-border hover:border-primary hover:bg-secondary"
                )}
              >
                {s.done && <Check className="h-3.5 w-3.5 text-primary-foreground animate-check-pop" strokeWidth={3} />}
              </button>

              {editingId === s.id ? (
                <div className="flex-1 flex items-center gap-1.5">
                  <Input
                    value={editingText}
                    onChange={(e) => setEditingText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); handleSaveEdit(s.id); }
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    autoFocus
                    className="h-8 text-sm rounded-lg"
                  />
                  <button type="button" onClick={() => handleSaveEdit(s.id)} className="p-1 text-primary hover:bg-primary/10 rounded-md" aria-label="Save">
                    <Check className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => setEditingId(null)} className="p-1 text-muted-foreground hover:bg-secondary rounded-md" aria-label="Cancel">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <p className={cn("flex-1 text-sm text-primary-deep leading-snug pt-0.5", s.done && "line-through text-muted-foreground")}>
                  {s.title}
                </p>
              )}

              {!readOnly && editingId !== s.id && (
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => { setEditingId(s.id); setEditingText(s.title); }}
                    className="p-1 text-muted-foreground hover:text-primary rounded-md"
                    aria-label="Edit step"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(s)}
                    className="p-1 text-muted-foreground hover:text-destructive rounded-md"
                    aria-label="Delete step"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Add a new step */}
      {!readOnly && (
        <form onSubmit={handleAdd} className="flex gap-2">
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Add a small step…"
            className="h-9 text-sm rounded-xl bg-background/60 border-primary/15"
            maxLength={200}
          />
          <Button
            type="submit"
            size="sm"
            disabled={!newTitle.trim() || adding}
            className="h-9 rounded-xl bg-gradient-ocean text-primary-foreground gap-1"
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        </form>
      )}

      {allDone && total > 0 && (
        <p className="text-xs text-primary text-center pt-1">All steps done — task auto-completed 🌊</p>
      )}

      {/* Template picker */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="rounded-3xl max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-xl text-primary-deep">
              Break this down
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              {templateGroup === "advocate"
                ? "Pick a template for advocate-side work."
                : "Pick a template for your own to-do."}
            </p>
          </DialogHeader>
          <div className="mt-2 space-y-2 max-h-[60vh] overflow-y-auto pr-1">
            {templates.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => handlePickTemplate(tpl)}
                className="w-full text-left rounded-2xl border border-primary/15 bg-background/60 hover:bg-primary/5 hover:border-primary/30 transition-calm p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-sm text-primary-deep">{tpl.title}</p>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {tpl.items.length === 0 ? "Blank" : `${tpl.items.length} steps`}
                  </span>
                </div>
                {tpl.hint && <p className="text-xs text-muted-foreground mt-1">{tpl.hint}</p>}
                {tpl.items.length > 0 && (
                  <ul className="mt-2 space-y-0.5">
                    {tpl.items.slice(0, 3).map((it, i) => (
                      <li key={i} className="text-xs text-muted-foreground truncate">• {it}</li>
                    ))}
                    {tpl.items.length > 3 && (
                      <li className="text-xs text-muted-foreground/70">+ {tpl.items.length - 3} more</li>
                    )}
                  </ul>
                )}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
