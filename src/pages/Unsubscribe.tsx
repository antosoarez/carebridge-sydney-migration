import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export default function Unsubscribe() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<"loading" | "valid" | "already" | "invalid" | "done" | "error">("loading");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) { setState("invalid"); return; }
    (async () => {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(token)}`, {
          headers: { apikey: SUPABASE_ANON },
        });
        const data = await res.json();
        if (!res.ok) { setState("invalid"); return; }
        if (data.valid) setState("valid");
        else if (data.reason === "already_unsubscribed") setState("already");
        else setState("invalid");
      } catch { setState("error"); }
    })();
  }, [token]);

  const confirm = async () => {
    if (!token) return;
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("handle-email-unsubscribe", { body: { token } });
    setSubmitting(false);
    if (error) { setState("error"); return; }
    if (data?.success || data?.reason === "already_unsubscribed") setState("done");
    else setState("error");
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="glass-card p-10 max-w-md w-full text-center">
        {state === "loading" && <Loader2 className="h-10 w-10 mx-auto animate-spin text-primary" />}
        {state === "valid" && (
          <>
            <h1 className="font-display text-2xl text-primary-deep mb-2">Unsubscribe</h1>
            <p className="text-muted-foreground mb-6">You'll stop receiving emails from CareBridge Perth.</p>
            <Button onClick={confirm} disabled={submitting} className="rounded-2xl bg-gradient-ocean">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm unsubscribe"}
            </Button>
          </>
        )}
        {state === "already" && (
          <>
            <CheckCircle2 className="h-10 w-10 mx-auto text-success mb-3" />
            <p className="font-display text-xl text-primary-deep">You're already unsubscribed.</p>
          </>
        )}
        {state === "done" && (
          <>
            <CheckCircle2 className="h-10 w-10 mx-auto text-success mb-3" />
            <p className="font-display text-xl text-primary-deep">Unsubscribed.</p>
            <p className="text-muted-foreground mt-1">You won't receive any more emails from us.</p>
          </>
        )}
        {(state === "invalid" || state === "error") && (
          <>
            <AlertTriangle className="h-10 w-10 mx-auto text-destructive mb-3" />
            <p className="font-display text-xl text-primary-deep">
              {state === "invalid" ? "Invalid or expired link" : "Something went wrong"}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
