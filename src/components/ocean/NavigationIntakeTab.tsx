import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ClipboardList, Check, X } from "lucide-react";

type Profile = {
  preferred_name: string | null;
  preferred_language: string | null;
  preferred_contact_method: string | null;
  onboarding_completed_at: string | null;
  navigation_intake_seen_at: string | null;
};

type Consent = {
  id: string;
  kind: "scope_acknowledgment" | "privacy_consent" | string;
  language: string;
  accepted_at: string;
};

type Intake = {
  language: string;
  help_with: string | null;
  whats_going_on: string | null;
  step_contacted_gp: boolean;
  step_got_referral: boolean;
  step_appointment_booked: boolean;
  steps_notes: string | null;
  matters_most: string | null;
  source: string;
  created_at: string;
  updated_at: string;
};

const LANG_LABEL: Record<string, string> = {
  en: "English",
  es: "Español",
  pt: "Português",
};

const CONTACT_LABEL: Record<string, string> = {
  app: "In-app",
  email: "Email",
  phone: "Phone",
};

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

export function NavigationIntakeTab({ clientId }: { clientId: string }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [consents, setConsents] = useState<Consent[]>([]);
  const [intake, setIntake] = useState<Intake | null>(null);
  const [loading, setLoading] = useState(true);
  const [tablesMissing, setTablesMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const sb = supabase as any;

      const [pRes, cRes, iRes] = await Promise.all([
        sb
          .from("profiles")
          .select(
            "preferred_name, preferred_language, preferred_contact_method, onboarding_completed_at, navigation_intake_seen_at",
          )
          .eq("id", clientId)
          .maybeSingle(),
        sb
          .from("client_consents")
          .select("id, kind, language, accepted_at")
          .eq("user_id", clientId)
          .order("accepted_at", { ascending: false }),
        sb
          .from("client_navigation_intake")
          .select(
            "language, help_with, whats_going_on, step_contacted_gp, step_got_referral, step_appointment_booked, steps_notes, matters_most, source, created_at, updated_at",
          )
          .eq("client_id", clientId)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (cancelled) return;

      // Detect schema-cache errors so we can show a friendly message.
      const schemaMissing =
        (cRes.error && /schema cache|does not exist/i.test(cRes.error.message)) ||
        (iRes.error && /schema cache|does not exist/i.test(iRes.error.message));
      setTablesMissing(Boolean(schemaMissing));

      setProfile((pRes.data as Profile) ?? null);
      setConsents((cRes.data as Consent[]) ?? []);
      setIntake((iRes.data as Intake) ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  if (loading) {
    return (
      <section className="glass-card p-6">
        <div className="flex items-center gap-2 mb-2">
          <ClipboardList className="h-4 w-4 text-primary" />
          <h2 className="font-display text-xl text-primary-deep">Navigation intake</h2>
        </div>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </section>
    );
  }

  const scope = consents.find((c) => c.kind === "scope_acknowledgment");
  const privacy = consents.find((c) => c.kind === "privacy_consent");
  const hasAnyIntake =
    intake &&
    (intake.help_with ||
      intake.whats_going_on ||
      intake.matters_most ||
      intake.steps_notes ||
      intake.step_contacted_gp ||
      intake.step_got_referral ||
      intake.step_appointment_booked);

  return (
    <section className="glass-card p-6 space-y-6">
      <div className="flex items-center gap-2">
        <ClipboardList className="h-4 w-4 text-primary" />
        <h2 className="font-display text-xl text-primary-deep">Navigation intake</h2>
        <span className="ml-auto text-xs text-muted-foreground">
          {profile?.onboarding_completed_at
            ? `Onboarded ${formatTs(profile.onboarding_completed_at)}`
            : "Onboarding incomplete"}
        </span>
      </div>

      {tablesMissing && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          The intake tables aren't available yet. They appear automatically once the
          database migration runs.
        </div>
      )}

      {/* Consents */}
      <div>
        <h3 className="text-sm font-semibold text-primary-deep mb-2">Consents</h3>
        <div className="grid sm:grid-cols-2 gap-2">
          <ConsentRow
            label="Scope acknowledgment"
            accepted={Boolean(scope)}
            at={scope?.accepted_at ?? null}
          />
          <ConsentRow
            label="Privacy consent"
            accepted={Boolean(privacy)}
            at={privacy?.accepted_at ?? null}
          />
        </div>
      </div>

      {/* About you */}
      <div>
        <h3 className="text-sm font-semibold text-primary-deep mb-2">About this client</h3>
        <dl className="grid sm:grid-cols-3 gap-3 text-sm">
          <Field label="Preferred name" value={profile?.preferred_name} />
          <Field
            label="Preferred language"
            value={
              profile?.preferred_language
                ? LANG_LABEL[profile.preferred_language] ?? profile.preferred_language
                : null
            }
          />
          <Field
            label="Preferred contact"
            value={
              profile?.preferred_contact_method
                ? CONTACT_LABEL[profile.preferred_contact_method] ??
                  profile.preferred_contact_method
                : null
            }
          />
        </dl>
      </div>

      {/* Part B */}
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <h3 className="text-sm font-semibold text-primary-deep">What they want help with</h3>
          {intake?.updated_at && (
            <span className="text-[11px] text-muted-foreground">
              Updated {formatTs(intake.updated_at)}
            </span>
          )}
        </div>
        {!hasAnyIntake ? (
          <p className="text-sm text-muted-foreground italic">
            No intake submitted yet. The client may have skipped this step or hasn't reached it.
          </p>
        ) : (
          <div className="space-y-3 text-sm">
            <LongField label="What they'd like help with" value={intake?.help_with} />
            <LongField label="What's going on" value={intake?.whats_going_on} />
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                Steps already taken
              </p>
              <ul className="space-y-1">
                <StepLine done={!!intake?.step_contacted_gp} label="Contacted GP" />
                <StepLine done={!!intake?.step_got_referral} label="Got referral" />
                <StepLine done={!!intake?.step_appointment_booked} label="Appointment booked" />
              </ul>
              {intake?.steps_notes && (
                <p className="mt-2 text-sm text-foreground/90 whitespace-pre-wrap">
                  {intake.steps_notes}
                </p>
              )}
            </div>
            <LongField label="What matters most" value={intake?.matters_most} />
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Read-only · use these answers to plan your next conversation and tasks.
      </p>
    </section>
  );
}

function ConsentRow({
  label,
  accepted,
  at,
}: {
  label: string;
  accepted: boolean;
  at: string | null;
}) {
  return (
    <div
      className={`rounded-xl border p-3 flex items-start gap-2 ${
        accepted ? "border-emerald-200 bg-emerald-50/60" : "border-amber-200 bg-amber-50/60"
      }`}
    >
      {accepted ? (
        <Check className="h-4 w-4 text-emerald-700 mt-0.5 shrink-0" />
      ) : (
        <X className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
      )}
      <div className="min-w-0">
        <p className="text-sm font-medium text-primary-deep">{label}</p>
        <p className="text-xs text-muted-foreground">
          {accepted ? `Accepted ${formatTs(at)}` : "Pending"}
        </p>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-foreground">
        {value && value.trim() ? value : <span className="text-muted-foreground italic">Not provided</span>}
      </dd>
    </div>
  );
}

function LongField({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value || !value.trim()) return null;
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{label}</p>
      <p className="text-foreground whitespace-pre-wrap leading-relaxed">{value}</p>
    </div>
  );
}

function StepLine({ done, label }: { done: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      {done ? (
        <Check className="h-3.5 w-3.5 text-emerald-700" />
      ) : (
        <span className="h-3.5 w-3.5 rounded-full border border-muted-foreground/40" />
      )}
      <span className={done ? "text-foreground" : "text-muted-foreground"}>{label}</span>
    </li>
  );
}
