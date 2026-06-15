import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";
import { Link2, Check, Loader2, Copy, MessageCircle, Smartphone } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

type Props = {
  email: string;
  size?: "sm" | "default";
  variant?: "ghost" | "outline" | "secondary";
};

const issuedKey = (email: string) => `invite-issued:${email.toLowerCase()}`;

// Best-effort clipboard write that works across browsers, including iPad Safari
// where async clipboard calls after `await` lose the user-gesture context.
// Falls back to a hidden <textarea> + document.execCommand("copy"), then signals
// failure so the caller can show a manual-copy dialog.
async function bestEffortCopy(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to execCommand */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "0";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function CopyInviteLinkButton({ email, size = "sm", variant = "ghost" }: Props) {
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualLink, setManualLink] = useState("");
  const manualInputRef = useRef<HTMLTextAreaElement>(null);

  const generate = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-invite-link", {
        body: { email, redirect_to: `${window.location.origin}/welcome` },
      });
      if (error) throw error;
      const payload = data as { action_link?: string; error?: string };
      if (payload?.error) throw new Error(payload.error);
      if (!payload?.action_link) throw new Error("No link returned");

      try { localStorage.setItem(issuedKey(email), new Date().toISOString()); } catch { /* ignore */ }

      // Try to copy in the same gesture chain (works on desktop). Regardless
      // of result, open the share dialog so the user can also pick SMS /
      // WhatsApp, or copy manually on iPad Safari where async copy is blocked.
      const copiedOk = await bestEffortCopy(payload.action_link);
      setManualLink(payload.action_link);
      setManualOpen(true);
      if (copiedOk) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
        toast({ title: "Invite link copied 🔗", description: "Or share via SMS / WhatsApp from the dialog." });
      }
    } catch (err: any) {
      toast({ title: "Couldn't generate link", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleClick = () => {
    const alreadyIssued = (() => {
      try { return !!localStorage.getItem(issuedKey(email)); } catch { return false; }
    })();
    if (alreadyIssued) {
      setConfirmOpen(true);
    } else {
      void generate();
    }
  };

  const copyFromDialog = async () => {
    const ok = await bestEffortCopy(manualLink);
    if (ok) {
      toast({ title: "Invite link copied 🔗", description: "Paste it into WhatsApp, SMS or email." });
      setManualOpen(false);
    } else {
      // Select the text so the user can copy manually.
      manualInputRef.current?.focus();
      manualInputRef.current?.select();
      toast({
        title: "Tap and hold to copy",
        description: "Your browser blocked auto-copy. The link is selected — tap and hold, then choose Copy.",
      });
    }
  };

  return (
    <>
      <Button size={size} variant={variant} className="gap-2" onClick={handleClick} disabled={loading}>
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : copied ? <Check className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
        {copied ? "Copied" : "Copy invite link"}
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace the previous invite link?</AlertDialogTitle>
            <AlertDialogDescription>
              You've already generated an invite link for this client. Generating a new one will
              <strong> deactivate the previous link immediately</strong> — if you already sent it on
              WhatsApp, SMS or email, that one will stop working.
              <br /><br />
              Only continue if you need to re-send (e.g. the client lost the message).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep existing link</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmOpen(false); void generate(); }}>
              Generate new link
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share invite link</DialogTitle>
            <DialogDescription>
              Send the link to your client via SMS or WhatsApp, or copy and paste it anywhere.
            </DialogDescription>
          </DialogHeader>
          <textarea
            ref={manualInputRef}
            readOnly
            value={manualLink}
            onFocus={(e) => e.currentTarget.select()}
            onClick={(e) => e.currentTarget.select()}
            className="w-full min-h-[96px] resize-none rounded-md border bg-muted/40 p-3 text-sm font-mono break-all"
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => shareViaSms(manualLink)}
            >
              <Smartphone className="h-4 w-4" /> Send via SMS
            </Button>
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => shareViaWhatsApp(manualLink)}
            >
              <MessageCircle className="h-4 w-4" /> Send via WhatsApp
            </Button>
            <Button onClick={copyFromDialog} className="gap-2">
              <Copy className="h-4 w-4" /> Copy link
            </Button>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setManualOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Share helpers — open the OS's default SMS / WhatsApp composer with the
// invite link prefilled. The user picks the recipient inside that app.
function inviteMessage(link: string) {
  return `Hi! Here's your secure CareBridge invite link — tap to set up your account: ${link}`;
}

function shareViaSms(link: string) {
  // iOS prefers `&body=`, Android accepts `?body=`. `sms:?` works on both.
  const url = `sms:?&body=${encodeURIComponent(inviteMessage(link))}`;
  window.location.href = url;
}

function shareViaWhatsApp(link: string) {
  // wa.me without a number opens WhatsApp's contact picker with the text prefilled.
  const url = `https://wa.me/?text=${encodeURIComponent(inviteMessage(link))}`;
  window.open(url, "_blank", "noopener,noreferrer");
}
