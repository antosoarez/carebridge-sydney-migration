import { useEffect, useState } from "react";
import { AppShell } from "@/components/ocean/AppShell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { CreditCard, Loader2, Mail } from "lucide-react";

interface TierRow { name: string; price_aud: number; stripe_payment_link: string | null; description: string | null; }

export default function ClientPayment() {
  const { user } = useAuth();
  const [tier, setTier] = useState<TierRow | null>(null);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const { data: profile } = await supabase.from("profiles").select("tier, email").eq("id", user.id).maybeSingle();
      if (cancelled) return;
      setEmail(profile?.email ?? user.email ?? "");
      if (profile?.tier) {
        const { data: t } = await supabase
          .from("service_tiers").select("name, price_aud, stripe_payment_link, description")
          .eq("slug", profile.tier).eq("active", true).maybeSingle();
        if (!cancelled) setTier((t as TierRow) ?? null);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id, user?.email]);

  const pay = () => {
    if (!tier?.stripe_payment_link) return;
    const url = new URL(tier.stripe_payment_link);
    if (user?.id) url.searchParams.set("client_reference_id", user.id);
    if (email) url.searchParams.set("prefilled_email", email);
    window.location.href = url.toString();
  };

  const price = tier ? new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(tier.price_aud) : "";

  return (
    <AppShell role="client" title="Your payment" subtitle="One last step before we begin your care.">
      <div className="max-w-lg mx-auto">
        {loading ? (
          <div className="glass-card p-10 text-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
        ) : (
          <div className="glass-card p-8">
            <div className="h-12 w-12 rounded-2xl bg-accent/15 text-accent flex items-center justify-center mb-4">
              <CreditCard className="h-6 w-6" />
            </div>
            {tier ? (
              <>
                <h2 className="font-display text-2xl text-primary-deep">{tier.name}</h2>
                <p className="text-3xl font-display text-primary-deep mt-2">{price}</p>
                {tier.description && <p className="text-muted-foreground mt-2 text-sm">{tier.description}</p>}
                {tier.stripe_payment_link ? (
                  <Button onClick={pay} className="mt-6 w-full rounded-2xl h-12 bg-gradient-ocean shadow-soft">Pay now</Button>
                ) : (
                  <p className="mt-6 text-sm text-muted-foreground">Your advocate is setting up your payment link — please check back shortly.</p>
                )}
              </>
            ) : (
              <>
                <h2 className="font-display text-2xl text-primary-deep">Your service is being confirmed</h2>
                <p className="text-muted-foreground mt-2 text-sm">Your advocate will confirm your service and payment details with you shortly.</p>
              </>
            )}
            <div className="mt-6 pt-5 border-t border-border flex items-start gap-2 text-xs text-muted-foreground">
              <Mail className="h-4 w-4 mt-0.5 shrink-0" />
              <p>If you've arranged alternative payment (e.g. bank transfer), contact <a href="mailto:hello@carebridgeperth.com" className="text-primary hover:underline">hello@carebridgeperth.com</a> and we'll mark it for you.</p>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
