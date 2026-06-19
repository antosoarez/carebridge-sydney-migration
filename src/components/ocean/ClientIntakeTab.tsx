import { useClientIntake } from "@/lib/client-intake-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClipboardList } from "lucide-react";

function Row({ label, value }: { label: string; value?: string | null }) {
  const v = (value ?? "").trim();
  return (
    <div className="grid grid-cols-3 gap-3 py-1.5 border-b border-border/40 last:border-0">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground col-span-1">{label}</dt>
      <dd className="col-span-2 text-sm whitespace-pre-wrap">
        {v ? v : <span className="text-muted-foreground/60">—</span>}
      </dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card/60 p-4">
      <h3 className="font-semibold text-sm text-primary-deep mb-2">{title}</h3>
      <dl className="space-y-0">{children}</dl>
    </section>
  );
}

export function ClientIntakeTab({ clientId }: { clientId: string }) {
  const { data, loading, savedAt } = useClientIntake(clientId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardList className="h-4 w-4 text-primary" />
          Client intake
          {data.submitted_at && (
            <span className="ml-auto text-xs text-emerald-700 dark:text-emerald-300 font-medium">
              Submitted {new Date(data.submitted_at).toLocaleDateString()}
            </span>
          )}
        </CardTitle>
        {!data.submitted_at && savedAt && (
          <p className="text-xs text-muted-foreground">
            Draft — last saved {new Date(savedAt).toLocaleString()}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !savedAt ? (
          <p className="text-sm text-muted-foreground">
            The client hasn't started their intake yet.
          </p>
        ) : (
          <>
            <Section title="Personal details">
              <Row label="Full name" value={data.full_name} />
              <Row label="Preferred name" value={data.preferred_name} />
              <Row label="Date of birth" value={data.date_of_birth} />
              <Row label="Gender" value={data.gender} />
              <Row label="Pronouns" value={data.pronouns} />
              <Row label="Mobile" value={data.mobile_phone} />
              <Row label="Email" value={data.email} />
              <Row label="Address" value={data.residential_address} />
              <Row label="Suburb" value={data.suburb} />
              <Row label="Postcode" value={data.postcode} />
              <Row label="State" value={data.state} />
              <Row label="Emergency contact" value={[data.emergency_contact_name, data.emergency_contact_relationship, data.emergency_contact_phone].filter(Boolean).join(" · ")} />
            </Section>

            <Section title="Treating doctors">
              <Row label="GP" value={[data.gp_name, data.gp_clinic].filter(Boolean).join(" · ")} />
              <Row label="GP phone" value={data.gp_phone} />
              <Row label="GP email" value={data.gp_email} />
              <Row label="Specialists" value={data.specialists} />
            </Section>

            <Section title="Reason for engaging">
              <Row label="Services" value={data.services_interested.join(", ")} />
              <Row label="Help needed" value={data.help_needed} />
              <Row label="Main outcome" value={data.main_outcome} />
            </Section>

            <Section title="Current health concerns">
              <Row label="Main concerns" value={data.main_concerns} />
              <Row label="Onset" value={data.concerns_onset} />
            </Section>

            <Section title="Medical history">
              <Row label="Diagnosed conditions" value={data.diagnosed_conditions} />
              <Row label="Current medications" value={data.current_medications} />
              <Row label="Allergies" value={data.allergies} />
              <Row label="Recent investigations" value={data.recent_investigations} />
            </Section>

            <Section title="Administrative">
              <Row label="Referral source" value={data.referral_source} />
              <Row label="Preferred contact" value={data.preferred_contact_method} />
              <Row label="Other info" value={data.other_info} />
            </Section>
          </>
        )}
      </CardContent>
    </Card>
  );
}
