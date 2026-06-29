import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { CreditCard } from "lucide-react";

interface TierRow {
  name: string;
  price_aud: number;
  stripe_payment_link: string | null;
  description: string | null;
}

/**
 * Shown to a client who has completed agreements and is awaiting payment.
 * Redirects to the tier's Stripe Payment Link, passing client_reference_id so
 * the stripe-webhook can match the payment back to this client. Renders nothing
 * until the client is at "Awaiting payment" with a tier whose link is set.
 */
export function StripePaymentCta() {
  const { user } = useAuth();
  const [tier, setTier] = useState<TierRow | null>(null);
  const [email, setEmail] = useState<string>("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("lifecycle_status, tier, email")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled || !profile) { setLoaded(true); return; }
      if (profile.lifecycle_status !== "Awaiting payment" || !profile.tier) { setLoaded(true); return; }

      const { data: t } = await supabase
        .from("service_tiers")
        .select("name, price_aud, stripe_payment_link, description")
        .eq("slug", profile.tier)
        .eq("active", true)
        .maybeSingle();
      if (cancelled) return;
      setTier((t as TierRow) ?? null);
      setEmail(profile.email ?? user.email ?? "");
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [user?.id, user?.email]);

  if (!loaded || !tier || !tier.stripe_payment_link) return null;

  const goToCheckout = () => {
    const url = new URL(tier.stripe_payment_link as string);
    if (user?.id) url.searchParams.set("client_reference_id", user.id);
    if (email) url.searchParams.set("prefilled_email", email);
    window.location.href = url.toString();
  };

  const price = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(tier.price_aud);

  return (
    <div className="glass-card p-6 mb-6 bg-gradient-to-br from-secondary/30 to-accent/5 border border-accent/20 animate-fade-in">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-2xl bg-accent/15 text-accent flex items-center justify-center flex-shrink-0">
          <CreditCard className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-display text-lg text-primary-deep">One last step — your payment</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            {tier.name} — <span className="font-semibold text-primary-deep">{price}</span>.
            {tier.description ? ` ${tier.description}` : ""}
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Secure payment is handled by Stripe. You'll come right back here afterwards.
          </p>
          <Button onClick={goToCheckout} className="mt-4 rounded-2xl h-12 px-6 bg-gradient-ocean shadow-soft gap-2">
            Complete payment
          </Button>
        </div>
      </div>
    </div>
  );
}
