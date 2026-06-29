import { useEffect, useState } from "react";
import { AppShell } from "@/components/ocean/AppShell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { CreditCard, Loader2, Mail } from "lucide-react";
import {
  PAYMENT_ARRANGEMENT_LABEL, paymentStatus,
  useClientServicePayment, useServiceTiers,
} from "@/lib/service-payment-store";

function fmt(n: number) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n || 0);
}

export default function ClientPayment() {
  const { user } = useAuth();
  const { tiers } = useServiceTiers();
  const { arrangement, paidTotal, loading, paymentCompletedAt } = useClientServicePayment(user?.id);
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("profiles").select("email").eq("id", user.id).maybeSingle();
      if (!cancelled) setEmail(data?.email ?? user.email ?? "");
    })();
    return () => { cancelled = true; };
  }, [user?.id, user?.email]);

  const tier = tiers.find((t) => t.id === arrangement?.service_tier_id) ?? null;
  const total = arrangement?.total_amount ?? 0;
  const remaining = Math.max(0, total - paidTotal);
  const status = arrangement
    ? paymentStatus(total, paidTotal, arrangement.payment_arrangement)
    : { key: "unpaid" as const, label: "Awaiting your advocate" };

  const requestIssued = !!arrangement?.payment_request_issued_at;
  const serviceSelected = !!arrangement?.service_selected_at;
  const paymentLink = arrangement?.external_payment_link_url || tier?.stripe_payment_link || null;
  const canPay = requestIssued && paymentLink && status.key !== "full_paid"
    && status.key !== "waived";

  const pay = () => {
    if (!paymentLink) return;
    const url = new URL(paymentLink);
    if (user?.id) url.searchParams.set("client_reference_id", user.id);
    if (email) url.searchParams.set("prefilled_email", email);
    window.location.href = url.toString();
  };

  return (
    <AppShell role="client" title="Your payment" subtitle="A simple summary of your service and balance.">
      <div className="max-w-lg mx-auto">
        {loading ? (
          <div className="glass-card p-10 text-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
        ) : !serviceSelected ? (
          <div className="glass-card p-8">
            <div className="h-12 w-12 rounded-2xl bg-accent/15 text-accent flex items-center justify-center mb-4">
              <CreditCard className="h-6 w-6" />
            </div>
            <h2 className="font-display text-2xl text-primary-deep">Your service is being confirmed</h2>
            <p className="text-muted-foreground mt-2 text-sm">
              Your advocate will confirm your service and payment details with you shortly.
            </p>
          </div>
        ) : (
          <div className="glass-card p-8 space-y-4">
            <div className="h-12 w-12 rounded-2xl bg-accent/15 text-accent flex items-center justify-center">
              <CreditCard className="h-6 w-6" />
            </div>
            <div>
              <h2 className="font-display text-2xl text-primary-deep">
                {tier?.name ?? "Custom service"}
              </h2>
              {arrangement?.payment_arrangement && (
                <p className="text-muted-foreground text-sm mt-1">
                  {PAYMENT_ARRANGEMENT_LABEL[arrangement.payment_arrangement]}
                </p>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-secondary/40 p-3">
                <p className="text-xs text-muted-foreground">Agreed</p>
                <p className="font-display text-lg text-primary-deep">{fmt(total)}</p>
              </div>
              <div className="rounded-xl bg-secondary/40 p-3">
                <p className="text-xs text-muted-foreground">Paid</p>
                <p className="font-display text-lg text-primary-deep">{fmt(paidTotal)}</p>
              </div>
              <div className="rounded-xl bg-secondary/40 p-3">
                <p className="text-xs text-muted-foreground">Due</p>
                <p className="font-display text-lg text-primary-deep">{fmt(remaining)}</p>
              </div>
            </div>
            <div className="text-sm">
              <span className="font-semibold text-primary-deep">Status:</span>{" "}
              <span className="text-muted-foreground">{status.label}</span>
              {paymentCompletedAt && status.key === "full_paid" && (
                <span className="ml-2 text-xs text-muted-foreground">
                  · received {new Date(paymentCompletedAt).toLocaleDateString()}
                </span>
              )}
            </div>

            {canPay ? (
              <Button onClick={pay} className="w-full rounded-2xl h-12 bg-gradient-ocean shadow-soft">
                Pay {fmt(remaining)}
              </Button>
            ) : requestIssued ? (
              status.key === "full_paid" || status.key === "waived" || status.key === "external" ? (
                <p className="text-sm text-muted-foreground">Nothing further owed — thank you.</p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Your advocate is setting up your payment link — please check back shortly.
                </p>
              )
            ) : (
              <p className="text-sm text-muted-foreground">
                Your advocate hasn't sent the payment request yet. You'll be able to pay here when it's ready.
              </p>
            )}

            <div className="pt-4 border-t border-border flex items-start gap-2 text-xs text-muted-foreground">
              <Mail className="h-4 w-4 mt-0.5 shrink-0" />
              <p>If you've arranged alternative payment (e.g. bank transfer), contact <a href="mailto:hello@carebridgeperth.com" className="text-primary hover:underline">hello@carebridgeperth.com</a> and we'll mark it for you.</p>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
