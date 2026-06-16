import { useAgreements } from "@/lib/agreements-store";
import { Check, Clock, ShieldCheck } from "lucide-react";

function formatTs(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return "—";
  }
}

/**
 * Compact status summary for the four required agreement documents.
 * Shows accepted / pending with timestamp. Read-only — accepting still
 * happens via ClientAgreementsPanel below.
 */
export function AgreementStatusList({ clientId }: { clientId: string }) {
  const { docs, acceptances, loading } = useAgreements(clientId);
  if (loading) return null;
  if (docs.length === 0) return null;

  const accByDoc = new Map(acceptances.map((a) => [a.document_id, a]));

  return (
    <section className="glass-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <h2 className="font-display text-xl text-primary-deep">Document status</h2>
      </div>
      <ul className="grid sm:grid-cols-2 gap-2">
        {docs.map((d) => {
          const a = accByDoc.get(d.id);
          const accepted = Boolean(a);
          return (
            <li
              key={d.id}
              className={`rounded-xl border p-3 flex items-start gap-2 ${
                accepted
                  ? "border-emerald-200 bg-emerald-50/60"
                  : "border-amber-200 bg-amber-50/60"
              }`}
            >
              {accepted ? (
                <Check className="h-4 w-4 text-emerald-700 mt-0.5 shrink-0" />
              ) : (
                <Clock className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium text-primary-deep">
                  {d.title}
                  {!d.required && (
                    <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                      optional
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {accepted ? `Accepted ${formatTs(a?.accepted_at)}` : "Pending"}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
