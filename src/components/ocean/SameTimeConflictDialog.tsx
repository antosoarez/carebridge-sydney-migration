import { Layers, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";

export interface ExistingAppt {
  id: string;
  title: string;
  starts_at: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  existing: ExistingAppt | null;
  clientLabel: string;
  saving?: boolean;
  onConfirmSeparate: () => void;
  onOpenExisting: () => void;
}

export function SameTimeConflictDialog({
  open,
  onOpenChange,
  existing,
  clientLabel,
  saving,
  onConfirmSeparate,
  onOpenExisting,
}: Props) {
  if (!existing) return null;
  const time = new Date(existing.starts_at).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="rounded-3xl border-border/60 bg-card/95 backdrop-blur-md sm:max-w-md">
        <AlertDialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-secondary/70">
            <Layers className="h-5 w-5 text-accent" aria-hidden="true" />
          </div>
          <AlertDialogTitle className="font-display text-xl text-primary-deep text-center">
            Just checking 🌊
          </AlertDialogTitle>
          <AlertDialogDescription className="text-center text-sm text-muted-foreground leading-relaxed">
            There's already{" "}
            <span className="font-medium text-primary-deep">“{existing.title}”</span>{" "}
            for <span className="font-medium text-primary-deep">{clientLabel}</span>{" "}
            at <span className="font-medium text-primary-deep">{time}</span>.
            <br />
            Is this a separate appointment, or did you mean to edit the existing one?
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter className="flex-col-reverse gap-2 sm:flex-col-reverse sm:gap-2 sm:space-x-0">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="w-full rounded-2xl"
            disabled={saving}
          >
            Never mind
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onOpenExisting}
            className="w-full rounded-2xl border-border/60"
            disabled={saving}
          >
            Open the existing one instead
          </Button>
          <Button
            type="button"
            onClick={onConfirmSeparate}
            disabled={saving}
            className="w-full rounded-2xl bg-gradient-ocean shadow-soft gap-2"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Yes, this is separate — save it
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Look up an existing appointment at the same client_id + starts_at. Returns null if none. */
export async function findSameTimeAppt(
  supabase: { from: (t: string) => any },
  clientId: string,
  startsIso: string,
): Promise<ExistingAppt | null> {
  const { data } = await supabase
    .from("appointments")
    .select("id, title, starts_at")
    .eq("client_id", clientId)
    .eq("starts_at", startsIso)
    .limit(1);
  const row = (data ?? [])[0];
  return row ? { id: row.id, title: row.title, starts_at: row.starts_at } : null;
}
