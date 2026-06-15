import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";
import { LifeBuoy, Send } from "lucide-react";
import { useAuth } from "@/lib/auth";

const SUPPORT_EMAIL = "hello@carebridgeperth.com";

export function NeedAHandButton() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fromName = (name.trim() || (user?.user_metadata as any)?.full_name || "").slice(0, 120);
    const fromEmail = (email.trim() || user?.email || "").slice(0, 255);
    const msg = message.trim().slice(0, 2000);
    if (!msg) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "support-request",
          recipientEmail: SUPPORT_EMAIL,
          idempotencyKey: `support-${user?.id ?? "anon"}-${Date.now()}`,
          templateData: {
            fromName,
            fromEmail,
            message: msg,
            context: `Sent from ${typeof window !== "undefined" ? window.location.pathname : ""}`,
          },
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({ title: "We've got your message 💌", description: "Sara will get back to you soon." });
      setMessage(""); setName(""); setEmail(""); setOpen(false);
    } catch (err: any) {
      toast({ title: "Couldn't send", description: err.message ?? "Please try again.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className="pointer-events-auto inline-flex items-center gap-2 h-12 px-4 rounded-full bg-gradient-ocean text-primary-foreground shadow-float hover:-translate-y-0.5 transition-calm font-semibold text-sm"
          aria-label="Need a hand?"
        >
          <LifeBuoy className="h-4 w-4" /> Need a hand?
        </button>
      </DialogTrigger>
      <DialogContent className="rounded-3xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl text-primary-deep">Need a hand?</DialogTitle>
          <DialogDescription>
            Tell us what's going on and we'll get back to you. No pressure, no rush.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label htmlFor="hand-name">Your name</Label>
            <Input id="hand-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={(user?.user_metadata as any)?.full_name || "Your name"} maxLength={120} className="h-11 rounded-xl bg-card" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hand-email">Your email</Label>
            <Input id="hand-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={user?.email || "you@example.com"} maxLength={255} className="h-11 rounded-xl bg-card" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hand-message">What's on your mind?</Label>
            <Textarea id="hand-message" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="A short note about what you need help with…" maxLength={2000} required className="min-h-[120px] rounded-xl bg-card" />
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={submitting || !message.trim()} className="rounded-2xl bg-gradient-ocean gap-2">
              <Send className="h-4 w-4" /> {submitting ? "Sending…" : "Send"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
