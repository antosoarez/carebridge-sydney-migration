import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatCurrency, isOverdueSevenDays } from "@/lib/payments-store";
import { Waves, X } from "lucide-react";

interface OutstandingRow {
  id: string;
  label: string;
  amount: number;
  invoice_given_at: string | null;
}

/**
 * Soft, dismissible card shown to a client when one of their payments
 * has been outstanding for more than 7 days after the invoice was given.
 * Ocean-toned, not alarming, dismissible.
 */
export function PaymentOutstandingNote() {
  const { user } = useAuth();
  const [rows, setRows] = useState<OutstandingRow[]>([]);
  const [bank, setBank] = useState("");
  const [currency, setCurrency] = useState("AUD");
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const [{ data: pays }, { data: settings }, { data: dis }] = await Promise.all([
        supabase
          .from("client_payments")
          .select("id, label, amount, invoice_given_at, invoice_given, paid")
          .eq("client_id", user.id)
          .eq("invoice_given", true)
          .eq("paid", false),
        supabase.from("payment_settings").select("bank_details, currency").eq("id", 1).maybeSingle(),
        supabase.from("payment_note_dismissals").select("payment_id").eq("client_id", user.id),
      ]);
      if (cancelled) return;
      const outstanding = (pays ?? [])
        .filter((p: any) => isOverdueSevenDays(p.invoice_given_at))
        .map((p: any) => ({
          id: p.id, label: p.label, amount: Number(p.amount), invoice_given_at: p.invoice_given_at,
        }));
      setRows(outstanding);
      setBank(settings?.bank_details ?? "");
      setCurrency(settings?.currency ?? "AUD");
      setDismissed(new Set((dis ?? []).map((d: any) => d.payment_id)));
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  if (!loaded || !user?.id) return null;
  const visible = rows.filter((r) => !dismissed.has(r.id));
  if (visible.length === 0) return null;

  const dismiss = async (paymentId: string) => {
    setDismissed((prev) => new Set(prev).add(paymentId));
    await supabase.from("payment_note_dismissals").upsert(
      { client_id: user.id, payment_id: paymentId },
      { onConflict: "client_id,payment_id" },
    );
  };

  return (
    <div className="space-y-3 mb-6">
      {visible.map((r) => (
        <div
          key={r.id}
          className="glass-card p-5 bg-gradient-to-br from-secondary/30 to-accent/5 border border-accent/20 animate-fade-in"
        >
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-2xl bg-accent/15 text-accent flex items-center justify-center flex-shrink-0">
              <Waves className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-display text-base text-primary-deep">
                A gentle reminder about a payment
              </p>
              <p className="text-sm text-muted-foreground mt-0.5">
                {r.label} — <span className="font-semibold text-primary-deep">{formatCurrency(r.amount, currency)}</span> is outstanding.
              </p>
              {bank && (
                <details className="mt-3 group">
                  <summary className="text-xs text-primary cursor-pointer select-none hover:underline">
                    View bank transfer details
                  </summary>
                  <pre className="mt-2 text-xs text-primary-deep whitespace-pre-wrap font-sans rounded-xl bg-background/60 p-3">
{bank}
                  </pre>
                </details>
              )}
              <p className="text-xs text-muted-foreground mt-3">
                No rush — once your transfer is sent, your advocate will mark it received and this note will disappear.
              </p>
            </div>
            <button
              type="button"
              onClick={() => dismiss(r.id)}
              className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-primary-deep hover:bg-background/60 transition-calm flex-shrink-0"
              aria-label="Dismiss"
              title="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
