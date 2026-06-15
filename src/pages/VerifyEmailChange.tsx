import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";

export default function VerifyEmailChange() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const navigate = useNavigate();
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [message, setMessage] = useState<string>("");
  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) {
        setState("error");
        setMessage("This link is missing its confirmation code.");
        return;
      }
      try {
        const { data, error } = await supabase.functions.invoke("verify-email-change", {
          body: { token },
        });
        if (cancelled) return;
        if (error) {
          setState("error");
          setMessage((error as any).message ?? "We couldn't confirm this link.");
          return;
        }
        if ((data as any)?.error) {
          setState("error");
          setMessage((data as any).error);
          return;
        }
        setEmail((data as any)?.email ?? "");
        setState("ok");
      } catch (e: any) {
        if (cancelled) return;
        setState("error");
        setMessage(e?.message ?? "Something went wrong.");
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  return (
    <main className="min-h-dvh flex items-center justify-center px-4 py-12 bg-gradient-to-b from-secondary/40 to-background">
      <div className="glass-card max-w-md w-full p-8 text-center rounded-3xl">
        {state === "loading" && (
          <>
            <Loader2 className="h-10 w-10 mx-auto text-primary animate-spin" />
            <h1 className="font-display text-2xl text-primary-deep mt-4">Just a moment…</h1>
            <p className="text-sm text-muted-foreground mt-2">Confirming your new email.</p>
          </>
        )}
        {state === "ok" && (
          <>
            <div className="inline-flex h-14 w-14 rounded-2xl bg-primary/10 text-primary items-center justify-center mx-auto">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h1 className="font-display text-2xl text-primary-deep mt-4">Your email is updated 🌊</h1>
            {email && (
              <p className="text-sm text-muted-foreground mt-2">
                You can now sign in with <span className="font-semibold text-primary-deep">{email}</span>.
              </p>
            )}
            <Button className="mt-6 rounded-2xl h-11 bg-gradient-ocean" onClick={() => navigate("/")}>
              Go to sign-in
            </Button>
          </>
        )}
        {state === "error" && (
          <>
            <div className="inline-flex h-14 w-14 rounded-2xl bg-accent/20 text-primary-deep items-center justify-center mx-auto">
              <AlertCircle className="h-7 w-7" />
            </div>
            <h1 className="font-display text-2xl text-primary-deep mt-4">We couldn't confirm this link</h1>
            <p className="text-sm text-muted-foreground mt-2">{message}</p>
            <p className="text-xs text-muted-foreground mt-3">
              Your existing email still works as your login — nothing has changed.
            </p>
            <Link to="/" className="inline-block mt-6 text-sm text-primary underline">Back to sign-in</Link>
          </>
        )}
      </div>
    </main>
  );
}
