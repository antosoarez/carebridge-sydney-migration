import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Mail, Clock3, CheckCircle2, RefreshCw, X, Pencil } from "lucide-react";

interface PendingRow {
  id: string;
  new_email: string;
  old_email: string;
  expires_at: string;
  initiator_role: "advocate" | "client";
}

interface Props {
  /** The user whose email may change. */
  targetUserId: string;
  /** Current/verified email shown beside the control. */
  currentEmail: string;
  /** "self" → client editing their own (password required); "advocate" → advocate editing a client. */
  mode: "self" | "advocate";
  /** Optional: when the verified email actually changes, parent can refresh. */
  onChanged?: () => void;
}

export function EmailChangeSection({ targetUserId, currentEmail, mode, onChanged }: Props) {
  const { toast } = useToast();
  const [pending, setPending] = useState<PendingRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acting, setActing] = useState<"resend" | "cancel" | null>(null);

  const loadPending = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("email_change_requests")
      .select("id, new_email, old_email, expires_at, initiator_role, status, created_at")
      .eq("user_id", targetUserId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setPending((data as any) ?? null);
    setLoading(false);
  };

  useEffect(() => {
    loadPending();
    // soft poll on focus
    const onFocus = () => loadPending();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetUserId]);

  const submit = async () => {
    const trimmed = newEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast({ title: "That email doesn't look right", description: "Please double-check and try again.", variant: "destructive" });
      return;
    }
    if (mode === "self" && !password) {
      toast({ title: "Password needed", description: "Please enter your current password.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("request-email-change", {
        body: {
          user_id: targetUserId,
          new_email: trimmed,
          ...(mode === "self" ? { current_password: password } : {}),
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({
        title: "Check the new inbox 💌",
        description: `We've sent a confirmation link to ${trimmed}. The email only changes once that link is opened.`,
      });
      setOpen(false);
      setNewEmail("");
      setPassword("");
      await loadPending();
    } catch (e: any) {
      toast({ title: "Couldn't start the change", description: e?.message ?? "Please try again.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const resend = async () => {
    if (!pending) return;
    setActing("resend");
    try {
      const { data, error } = await supabase.functions.invoke("resend-email-change", { body: { request_id: pending.id } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({ title: "Sent again 💌", description: `Fresh link on its way to ${pending.new_email}.` });
      await loadPending();
    } catch (e: any) {
      toast({ title: "Couldn't resend", description: e?.message ?? "Please try again.", variant: "destructive" });
    } finally {
      setActing(null);
    }
  };

  const cancel = async () => {
    if (!pending) return;
    setActing("cancel");
    try {
      const { data, error } = await supabase.functions.invoke("cancel-email-change", { body: { request_id: pending.id } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({ title: "Cancelled", description: "The pending email change has been cancelled." });
      await loadPending();
      onChanged?.();
    } catch (e: any) {
      toast({ title: "Couldn't cancel", description: e?.message ?? "Please try again.", variant: "destructive" });
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="space-y-2">
      <Label>Email</Label>
      <div className="flex items-center gap-2 flex-wrap">
        <Input value={currentEmail} readOnly disabled className="h-11 rounded-xl bg-card flex-1 min-w-[200px]" />
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="rounded-2xl h-11 gap-2">
              <Pencil className="h-4 w-4" />
              {mode === "self" ? "Change email" : "Edit email"}
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-2xl">
            <DialogHeader>
              <DialogTitle className="font-display text-primary-deep">
                {mode === "self" ? "Change your email" : "Edit this client's email"}
              </DialogTitle>
              <DialogDescription>
                {mode === "self"
                  ? "Enter your new email and your current password. We'll send a confirmation link to your new address — your existing email keeps working until you open it."
                  : "Enter the corrected email. We'll send a confirmation link to the new address. The client's existing email stays as their login until they open it."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="new-email">New email</Label>
                <Input
                  id="new-email"
                  type="email"
                  autoComplete="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="new@example.com"
                  className="h-11 rounded-xl"
                />
              </div>
              {mode === "self" && (
                <div className="space-y-1.5">
                  <Label htmlFor="cur-pw">Current password</Label>
                  <Input
                    id="cur-pw"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11 rounded-xl"
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" className="rounded-2xl" onClick={() => setOpen(false)} disabled={submitting}>
                Not now
              </Button>
              <Button className="rounded-2xl bg-gradient-ocean" onClick={submit} disabled={submitting}>
                {submitting ? "Sending…" : "Send confirmation"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Status chip */}
      {!loading && (
        <div className="flex items-center gap-2 flex-wrap pt-1">
          {pending ? (
            <>
              <span
                className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-semibold"
                style={{ backgroundColor: "hsl(200 70% 92%)", color: "hsl(210 40% 22%)" }}
              >
                <Clock3 className="h-3 w-3" />
                Pending — confirmation sent to {pending.new_email}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 rounded-full gap-1.5 text-xs"
                onClick={resend}
                disabled={acting !== null}
              >
                <RefreshCw className="h-3 w-3" /> {acting === "resend" ? "Sending…" : "Resend"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 rounded-full gap-1.5 text-xs text-muted-foreground hover:text-destructive"
                onClick={cancel}
                disabled={acting !== null}
              >
                <X className="h-3 w-3" /> {acting === "cancel" ? "Cancelling…" : "Cancel"}
              </Button>
            </>
          ) : (
            <span
              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-semibold"
              style={{ backgroundColor: "hsl(150 35% 90%)", color: "hsl(150 45% 22%)" }}
            >
              <CheckCircle2 className="h-3 w-3" /> Verified
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// Advocate-only history list of past email changes for a given client.
export function EmailChangeAuditLog({ clientId }: { clientId: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("email_change_requests")
        .select("id, old_email, new_email, status, initiator_role, created_at, verified_at, cancelled_at, expires_at")
        .eq("user_id", clientId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (cancelled) return;
      setRows(data ?? []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  if (loading) return null;
  if (!rows.length) return null;

  const STATUS_COLOR: Record<string, string> = {
    pending: "hsl(200 70% 92%)",
    verified: "hsl(150 35% 90%)",
    cancelled: "hsl(210 20% 92%)",
    expired: "hsl(35 60% 90%)",
    failed: "hsl(10 50% 92%)",
  };

  return (
    <section className="glass-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <Mail className="h-4 w-4 text-accent" />
        <h2 className="font-display text-xl text-primary-deep">Email change history</h2>
        <span className="text-xs text-muted-foreground">(audit log)</span>
      </div>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="rounded-2xl bg-secondary/30 p-3 text-sm">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="text-xs px-2 py-0.5 rounded-full font-semibold capitalize"
                style={{ backgroundColor: STATUS_COLOR[r.status] ?? "hsl(210 20% 92%)", color: "hsl(210 40% 22%)" }}
              >
                {r.status}
              </span>
              <span className="text-muted-foreground text-xs">
                {new Date(r.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
              </span>
              <span className="text-xs text-muted-foreground">· initiated by {r.initiator_role}</span>
            </div>
            <p className="mt-1 text-primary-deep break-all">
              <span className="text-muted-foreground">{r.old_email}</span>
              <span className="mx-1.5 text-muted-foreground">→</span>
              <span className="font-semibold">{r.new_email}</span>
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
