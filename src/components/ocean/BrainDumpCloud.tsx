import { useEffect, useRef, useState } from "react";
import { Waves, Mic, X, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useThoughts } from "@/lib/brain-dump-store";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const DRAFT_KEY = "oceanpath.braindump.draft.v1";

export function BrainDumpCloud({ author }: { author: "client" | "advocate" }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [savedHint, setSavedHint] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { add } = useThoughts();
  const { toast } = useToast();

  // Load draft on first open
  useEffect(() => {
    if (!open) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw && !text) setText(raw);
    } catch {}
    setTimeout(() => ref.current?.focus(), 60);
  }, [open]);

  // Auto-save draft as the user types (so nothing is lost)
  useEffect(() => {
    if (!open) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try { localStorage.setItem(DRAFT_KEY, text); } catch {}
      if (text.trim()) {
        setSavedHint(true);
        setTimeout(() => setSavedHint(false), 1100);
      }
    }, 350);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [text, open]);

  const commit = () => {
    const v = text.trim();
    if (!v) return;
    add(v, author);
    setText("");
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
    setOpen(false);
    toast({
      title: "Filed away 🌊",
      description: "One less thing to remember. You can organise it later.",
    });
  };

  return (
    <>
      {/* Subtle, fixed, semi-transparent ocean quick-add button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Brain dump — quick capture"
        title="Brain dump"
        className={cn(
          "pointer-events-auto h-14 w-14 rounded-full",
          "flex items-center justify-center",
          "bg-gradient-ocean text-primary-foreground/95",
          "shadow-soft ring-1 ring-primary/20 backdrop-blur-sm",
          "opacity-80 hover:opacity-100 hover:shadow-float",
          "transition-all duration-500 ease-out",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
          "animate-brain-dump-pulse",
        )}
      >
        <Waves className="h-5 w-5" strokeWidth={2} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4 md:p-6 bg-primary-deep/30 backdrop-blur-sm animate-fade-in pointer-events-auto"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Brain dump"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg glass-card p-6 md:p-7 bg-gradient-card relative animate-scale-in"
          >
            <button
              onClick={() => setOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-full text-muted-foreground hover:bg-secondary"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-accent">
              <Waves className="h-3.5 w-3.5" /> Brain Dump
            </div>
            <h2 className="font-display text-2xl text-primary-deep mt-2">
              What's floating in your mind?
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Drop thoughts here so you don't have to carry them. You can organise this later.
            </p>

            <Textarea
              ref={ref}
              aria-label="Brain dump"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="A worry, a question, something you don't want to forget…"
              className="mt-4 min-h-[140px] rounded-2xl border-primary/15 bg-background/60 focus-visible:ring-primary/40 resize-none"
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") commit();
              }}
            />

            <div className="flex items-center justify-between mt-3 gap-3">
              <span
                className={cn(
                  "text-[11px] text-primary/70 transition-opacity duration-500",
                  savedHint ? "opacity-100" : "opacity-0",
                )}
                aria-live="polite"
              >
                Draft saved
              </span>
              <span className="text-[11px] text-muted-foreground">
                Auto-saving as you type
              </span>
            </div>

            <div className="flex items-center justify-between mt-3 gap-3">
              <button
                onClick={() => {
                  setRecording((r) => !r);
                  toast({
                    title: "Voice notes — coming soon",
                    description: "We'll let you hold-to-talk here once it's ready.",
                  });
                }}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-calm",
                  recording
                    ? "bg-accent/15 text-accent"
                    : "bg-secondary/60 text-muted-foreground hover:text-primary-deep",
                )}
                aria-label="Voice note (coming soon)"
              >
                <Mic className="h-4 w-4" />
                Voice note
              </button>
              <Button
                onClick={commit}
                disabled={!text.trim()}
                className="rounded-2xl bg-gradient-ocean text-primary-foreground hover:opacity-90 gap-2"
              >
                <Send className="h-4 w-4" /> Save thought
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground/70 mt-3 text-center">
              ⌘ + Enter to file it away · no labels needed
            </p>
          </div>
        </div>
      )}
    </>
  );
}
