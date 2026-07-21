import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";
import { Mail, UserPlus, KeyRound } from "lucide-react";

type Method = "invite" | "direct";

export function InviteClientDialog({ trigger, onCreated }: { trigger?: React.ReactNode; onCreated?: () => void } = {}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [method, setMethod] = useState<Method>("invite");
  const [tempPassword, setTempPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => { setName(""); setEmail(""); setTempPassword(""); setMethod("invite"); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-create-client", {
        body: {
          email: email.trim(),
          full_name: name.trim(),
          method,
          temp_password: method === "direct" ? tempPassword : undefined,
          //redirect_to: `${window.location.origin}/welcome`,
          redirect_to: "https://www.client.carebridgeperth.com/welcome",
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({
        title: method === "invite" ? "Invitation sent 💌" : "Account created ✓",
        description: method === "invite"
          ? `${email} will get an email to set their password.`
          : `${email} can sign in now and will be asked to set their own password.`,
      });
      reset();
      setOpen(false);
      onCreated?.();
    } catch (err: any) {
      const msg = err?.message ?? "Please try again.";
      toast({ title: "Couldn't add client", description: msg, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button className="h-12 rounded-2xl bg-gradient-ocean gap-2 shadow-soft">
            <UserPlus className="h-4 w-4" /> Add client
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="rounded-3xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl text-primary-deep">Add a client</DialogTitle>
          <DialogDescription>
            Choose how to bring them in — send a gentle invite link, or create the account directly with a starting password.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label htmlFor="client-name">Their name</Label>
            <Input id="client-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Their full name" maxLength={120} className="h-11 rounded-xl bg-card" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="client-email">Their email</Label>
            <Input id="client-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" maxLength={255} className="h-11 rounded-xl bg-card" required />
          </div>

          <div className="space-y-2">
            <Label>How would you like to add them?</Label>
            <RadioGroup value={method} onValueChange={(v) => setMethod(v as Method)} className="gap-2">
              <label className="flex items-start gap-3 p-3 rounded-2xl bg-secondary/40 cursor-pointer">
                <RadioGroupItem value="invite" id="m-invite" className="mt-1" />
                <span className="text-sm">
                  <span className="font-semibold text-primary-deep flex items-center gap-2"><Mail className="h-3.5 w-3.5" /> Send invite link</span>
                  <span className="block text-xs text-muted-foreground">They get an email and set their own password. You never see it.</span>
                </span>
              </label>
              <label className="flex items-start gap-3 p-3 rounded-2xl bg-secondary/40 cursor-pointer">
                <RadioGroupItem value="direct" id="m-direct" className="mt-1" />
                <span className="text-sm">
                  <span className="font-semibold text-primary-deep flex items-center gap-2"><KeyRound className="h-3.5 w-3.5" /> Create account directly</span>
                  <span className="block text-xs text-muted-foreground">Set a starting password. They'll be required to change it on first sign-in.</span>
                </span>
              </label>
            </RadioGroup>
          </div>

          {method === "direct" && (
            <div className="space-y-2">
              <Label htmlFor="temp-pw">Temporary starting password</Label>
              <Input id="temp-pw" type="text" value={tempPassword} onChange={(e) => setTempPassword(e.target.value)} placeholder="At least 8 characters" minLength={8} maxLength={120} className="h-11 rounded-xl bg-card" required />
              <p className="text-xs text-muted-foreground">Share this with them privately. They must change it the first time they sign in.</p>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={submitting} className="rounded-2xl bg-gradient-ocean gap-2">
              {method === "invite" ? <Mail className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}
              {submitting ? "Working…" : method === "invite" ? "Send invitation" : "Create account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
