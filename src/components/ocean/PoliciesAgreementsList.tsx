import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { useAgreements, type AgreementDocument, type AgreementAcceptance } from "@/lib/agreements-store";
import { Check, ShieldCheck, FileText, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
  } catch {
    return iso;
  }
}

function DocumentBlock({
  doc,
  acceptance,
  onSign,
}: {
  doc: AgreementDocument;
  acceptance: AgreementAcceptance | undefined;
  onSign: (typedName: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [read, setRead] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [signing, setSigning] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const signed = !!acceptance;
  const canSign = read && typedName.trim().length >= 2 && !signing;

  const handleSign = async () => {
    if (!canSign) return;
    setSigning(true);
    try {
      await onSign(typedName.trim());
    } finally {
      setSigning(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card/70 overflow-hidden">
      <div className="flex items-start gap-3 p-4 border-b border-border/60">
        <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <FileText className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-base text-primary-deep">{doc.title}</h3>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              v{doc.version}
            </span>
            {signed && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-xs font-medium border border-emerald-500/30">
                <Check className="h-3 w-3" /> Signed {formatDate(acceptance!.accepted_at)}
              </span>
            )}
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          <span className="ml-1 text-xs">{expanded ? "Hide" : "Read"}</span>
        </Button>
      </div>

      {expanded && (
        <div className="p-4 space-y-4">
          <div
            className="prose prose-sm dark:prose-invert max-w-none max-h-96 overflow-y-auto rounded-xl border border-border/60 bg-background/60 p-4"
            aria-label={`Full text of ${doc.title}`}
          >
            <ReactMarkdown>{doc.body_md || "*(No content)*"}</ReactMarkdown>
          </div>

          {signed ? (
            <p className="text-xs text-muted-foreground">
              You signed this document on {formatDate(acceptance!.accepted_at)}. This record is
              retained as your electronic signature under the Electronic Transactions Act 1999
              (Cth).
            </p>
          ) : (
            <div className="space-y-3 rounded-xl border border-border bg-background/40 p-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <Checkbox
                  checked={read}
                  onCheckedChange={(v) => setRead(!!v)}
                  className="mt-0.5"
                  aria-label="I have read and understand this document"
                />
                <span className="text-sm">I have read and understand this document.</span>
              </label>

              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor={`name-${doc.id}`} className="text-xs">
                    Type your full name to sign
                  </Label>
                  <Input
                    id={`name-${doc.id}`}
                    value={typedName}
                    onChange={(e) => setTypedName(e.target.value)}
                    placeholder="e.g. Jane Mary Smith"
                    autoComplete="name"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`date-${doc.id}`} className="text-xs">
                    Date
                  </Label>
                  <Input id={`date-${doc.id}`} type="date" value={today} readOnly />
                </div>
              </div>

              <Button
                type="button"
                onClick={handleSign}
                disabled={!canSign}
                className="w-full sm:w-auto"
              >
                {signing ? "Signing…" : "Sign & Accept"}
              </Button>

              <p className="text-[11px] text-muted-foreground">
                By typing your full name and clicking Sign & Accept, you are providing an
                electronic signature with the same legal effect as a handwritten signature under
                the Electronic Transactions Act 1999 (Cth).
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function PoliciesAgreementsList({ clientId }: { clientId: string }) {
  const { docs, acceptances, requiredDocs, loading, accept } = useAgreements(clientId);

  const acceptanceByDocId = useMemo(() => {
    const m = new Map<string, AgreementAcceptance>();
    for (const a of acceptances) m.set(a.document_id, a);
    return m;
  }, [acceptances]);

  const required = docs.filter((d) => d.required);
  const optional = docs.filter((d) => !d.required);
  const signedRequired = required.filter((d) => acceptanceByDocId.has(d.id)).length;
  const progress = required.length > 0 ? (signedRequired / required.length) * 100 : 100;

  const handleSign = async (doc: AgreementDocument, typedName: string) => {
    await accept(doc, { notes: typedName });
  };

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-6">
      {required.length > 0 && (
        <div className="rounded-2xl bg-gradient-sky/40 border border-border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-primary-deep">Signing progress</span>
            <span className="text-sm tabular-nums text-muted-foreground">
              {signedRequired} of {required.length} agreements signed
            </span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Your Agreements
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            These documents must be read and signed before paid work can begin.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {required.length === 0 && (
            <p className="text-sm text-muted-foreground">No agreements required right now.</p>
          )}
          {required.map((d) => (
            <DocumentBlock
              key={d.id}
              doc={d}
              acceptance={acceptanceByDocId.get(d.id)}
              onSign={(name) => handleSign(d, name)}
            />
          ))}
        </CardContent>
      </Card>

      {optional.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-primary" />
              Our Policies
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Reference documents — read at your leisure. No signature required.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {optional.map((d) => (
              <div key={d.id} className="rounded-2xl border border-border bg-card/70 p-4">
                <details>
                  <summary className="cursor-pointer flex items-center gap-2 font-medium text-sm text-primary-deep">
                    <FileText className="h-4 w-4 text-primary" />
                    {d.title}
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground ml-auto">
                      v{d.version}
                    </span>
                  </summary>
                  <div className="prose prose-sm dark:prose-invert max-w-none mt-3 max-h-96 overflow-y-auto rounded-xl border border-border/60 bg-background/60 p-4">
                    <ReactMarkdown>{d.body_md || "*(No content)*"}</ReactMarkdown>
                  </div>
                </details>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
