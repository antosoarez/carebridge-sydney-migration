import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { useAgreements, type AgreementDocument } from "@/lib/agreements-store";
import { Check, ShieldCheck } from "lucide-react";

interface Props {
  clientId: string;
  /** When true (advocate view), allows ticking on behalf of the client. */
  asAdvocate?: boolean;
}

export function ClientAgreementsPanel({ clientId, asAdvocate = false }: Props) {
  const { docs, acceptedDocIds, allRequiredAccepted, loading, accept } = useAgreements(clientId);
  const [openDoc, setOpenDoc] = useState<AgreementDocument | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (loading) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Required agreements
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {docs.map((d) => {
          const accepted = acceptedDocIds.has(d.id);
          return (
            <div
              key={d.id}
              className="rounded-lg border bg-card/60 p-3 flex items-start gap-3"
            >
              <Checkbox
                checked={accepted}
                disabled={accepted || busyId === d.id || (!asAdvocate)}
                onCheckedChange={async (v) => {
                  if (!v || accepted) return;
                  setBusyId(d.id);
                  await accept(d);
                  setBusyId(null);
                }}
                aria-label={`Accept ${d.title}`}
                className="mt-1"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{d.title}</span>
                  {!d.required && (
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      optional
                    </span>
                  )}
                  {accepted && (
                    <span className="text-xs text-status-completed-fg flex items-center gap-1">
                      <Check className="h-3 w-3" /> Accepted
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline mt-1"
                  onClick={() => setOpenDoc(openDoc?.id === d.id ? null : d)}
                >
                  {openDoc?.id === d.id ? "Hide" : "Read"}
                </button>
                {openDoc?.id === d.id && (
                  <p className="mt-2 text-sm whitespace-pre-wrap text-muted-foreground">
                    {d.body_md}
                  </p>
                )}
              </div>
            </div>
          );
        })}

        <div className="text-xs text-muted-foreground">
          {allRequiredAccepted
            ? "All required agreements accepted. Payment can be sent."
            : "Payment is blocked until all required agreements are accepted."}
        </div>
      </CardContent>
    </Card>
  );
}
