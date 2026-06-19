import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "@/components/ocean/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { useClientIntake } from "@/lib/client-intake-store";
import {
  INTAKE_SERVICES,
  INTAKE_CONTACT_METHODS,
  type IntakeContactMethod,
} from "@/lib/client-intake-types";
import { toast } from "@/components/ui/use-toast";
import { Check, ClipboardList, Save } from "lucide-react";

function FieldRow({
  id,
  label,
  required,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}

export default function ClientIntakeForm() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, update, save, loading, saving, savedAt } = useClientIntake(user?.id);
  const [submitting, setSubmitting] = useState(false);
  const submitted = !!data.submitted_at;

  const sections = useMemo(
    () => [
      { id: "personal", label: "1. Personal details" },
      { id: "doctors", label: "2. Your treating doctors" },
      { id: "reason", label: "3. Reason for engaging CareBridge" },
      { id: "concerns", label: "4. Current health concerns" },
      { id: "history", label: "5. Medical history" },
      { id: "admin", label: "6. Administrative" },
    ],
    [],
  );

  const completionPct = useMemo(() => {
    const required: (keyof typeof data)[] = [
      "full_name",
      "date_of_birth",
      "mobile_phone",
      "email",
    ];
    const total = 20;
    let filled = 0;
    const keys: (keyof typeof data)[] = [
      "full_name",
      "date_of_birth",
      "mobile_phone",
      "email",
      "residential_address",
      "emergency_contact_name",
      "emergency_contact_phone",
      "gp_name",
      "gp_phone",
      "help_needed",
      "main_outcome",
      "main_concerns",
      "concerns_onset",
      "diagnosed_conditions",
      "current_medications",
      "allergies",
      "recent_investigations",
      "referral_source",
      "preferred_contact_method",
      "other_info",
    ];
    for (const k of keys) {
      const v = data[k];
      if (Array.isArray(v) ? v.length > 0 : String(v ?? "").trim() !== "") filled++;
    }
    if (data.services_interested.length > 0) filled = Math.min(total, filled + 1);
    return Math.round((filled / total) * 100);
  }, [data]);

  const toggleService = (svc: string) => {
    const next = data.services_interested.includes(svc)
      ? data.services_interested.filter((s) => s !== svc)
      : [...data.services_interested, svc];
    update({ services_interested: next });
  };

  const onSubmit = async () => {
    if (!data.full_name.trim() || !data.date_of_birth || !data.mobile_phone.trim() || !data.email.trim()) {
      toast({
        title: "Please complete required fields",
        description: "Full name, date of birth, mobile phone and email are required.",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    const res = await save(data, { submit: true });
    setSubmitting(false);
    if (res?.error) {
      toast({ title: "Couldn't submit", description: res.error, variant: "destructive" });
      return;
    }
    toast({ title: "Intake submitted", description: "Your advocate will review this shortly." });
    navigate("/client");
  };

  if (!user) return null;

  return (
    <AppShell role="client" title="Complete your intake">
      <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-6">
        <div>
          <div className="flex items-center gap-2 mb-1 text-primary">
            <ClipboardList className="h-5 w-5" />
            <span className="text-xs uppercase tracking-wide font-semibold">Client intake</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-serif text-primary-deep">
            Complete your intake
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            This helps your advocate understand what you need. You can save and come back later —
            answers are saved automatically. Required fields are marked with{" "}
            <span className="text-destructive">*</span>.
          </p>
        </div>

        <div className="rounded-2xl bg-gradient-sky/40 border border-border p-4">
          <div className="flex items-center justify-between mb-2 text-sm">
            <span className="text-primary-deep font-medium">Completion</span>
            <span className="tabular-nums text-muted-foreground">{completionPct}%</span>
          </div>
          <Progress value={completionPct} className="h-2" />
          <div className="mt-2 text-xs text-muted-foreground flex items-center gap-2">
            {saving ? (
              <>
                <Save className="h-3 w-3 animate-pulse" /> Saving…
              </>
            ) : savedAt ? (
              <>
                <Check className="h-3 w-3" /> Saved {new Date(savedAt).toLocaleTimeString()}
              </>
            ) : null}
            {submitted && (
              <span className="ml-auto inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                <Check className="h-3 w-3" /> Submitted{" "}
                {new Date(data.submitted_at!).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading your intake…</p>
        ) : (
          <Accordion type="single" collapsible defaultValue="personal" className="space-y-3">
            {/* Section 1 */}
            <AccordionItem value="personal" className="rounded-2xl border border-border bg-card/70 px-4">
              <AccordionTrigger className="text-left">1. Personal details</AccordionTrigger>
              <AccordionContent className="space-y-4 pt-2">
                <div className="grid sm:grid-cols-2 gap-4">
                  <FieldRow id="full_name" label="Full name" required>
                    <Input id="full_name" value={data.full_name} onChange={(e) => update({ full_name: e.target.value })} />
                  </FieldRow>
                  <FieldRow id="preferred_name" label="Preferred name">
                    <Input id="preferred_name" value={data.preferred_name} onChange={(e) => update({ preferred_name: e.target.value })} />
                  </FieldRow>
                  <FieldRow id="date_of_birth" label="Date of birth" required>
                    <Input id="date_of_birth" type="date" value={data.date_of_birth} onChange={(e) => update({ date_of_birth: e.target.value })} />
                  </FieldRow>
                  <FieldRow id="gender" label="Gender">
                    <Input id="gender" value={data.gender} onChange={(e) => update({ gender: e.target.value })} />
                  </FieldRow>
                  <FieldRow id="pronouns" label="Pronouns">
                    <Input id="pronouns" value={data.pronouns} onChange={(e) => update({ pronouns: e.target.value })} placeholder="e.g. she/her" />
                  </FieldRow>
                  <FieldRow id="mobile_phone" label="Mobile phone" required>
                    <Input id="mobile_phone" type="tel" value={data.mobile_phone} onChange={(e) => update({ mobile_phone: e.target.value })} />
                  </FieldRow>
                  <FieldRow id="email" label="Email" required>
                    <Input id="email" type="email" value={data.email} onChange={(e) => update({ email: e.target.value })} />
                  </FieldRow>
                </div>
                <FieldRow id="residential_address" label="Residential address">
                  <Input id="residential_address" value={data.residential_address} onChange={(e) => update({ residential_address: e.target.value })} />
                </FieldRow>
                <div className="grid sm:grid-cols-3 gap-4">
                  <FieldRow id="suburb" label="Suburb">
                    <Input id="suburb" value={data.suburb} onChange={(e) => update({ suburb: e.target.value })} />
                  </FieldRow>
                  <FieldRow id="postcode" label="Postcode">
                    <Input id="postcode" value={data.postcode} onChange={(e) => update({ postcode: e.target.value })} />
                  </FieldRow>
                  <FieldRow id="state" label="State">
                    <Input id="state" value={data.state} onChange={(e) => update({ state: e.target.value })} />
                  </FieldRow>
                </div>
                <div className="grid sm:grid-cols-3 gap-4">
                  <FieldRow id="emergency_contact_name" label="Emergency contact name">
                    <Input id="emergency_contact_name" value={data.emergency_contact_name} onChange={(e) => update({ emergency_contact_name: e.target.value })} />
                  </FieldRow>
                  <FieldRow id="emergency_contact_relationship" label="Relationship">
                    <Input id="emergency_contact_relationship" value={data.emergency_contact_relationship} onChange={(e) => update({ emergency_contact_relationship: e.target.value })} />
                  </FieldRow>
                  <FieldRow id="emergency_contact_phone" label="Phone">
                    <Input id="emergency_contact_phone" type="tel" value={data.emergency_contact_phone} onChange={(e) => update({ emergency_contact_phone: e.target.value })} />
                  </FieldRow>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Section 2 */}
            <AccordionItem value="doctors" className="rounded-2xl border border-border bg-card/70 px-4">
              <AccordionTrigger className="text-left">2. Your treating doctors</AccordionTrigger>
              <AccordionContent className="space-y-4 pt-2">
                <div className="grid sm:grid-cols-2 gap-4">
                  <FieldRow id="gp_name" label="GP name">
                    <Input id="gp_name" value={data.gp_name} onChange={(e) => update({ gp_name: e.target.value })} />
                  </FieldRow>
                  <FieldRow id="gp_clinic" label="GP clinic">
                    <Input id="gp_clinic" value={data.gp_clinic} onChange={(e) => update({ gp_clinic: e.target.value })} />
                  </FieldRow>
                  <FieldRow id="gp_phone" label="GP phone">
                    <Input id="gp_phone" type="tel" value={data.gp_phone} onChange={(e) => update({ gp_phone: e.target.value })} />
                  </FieldRow>
                  <FieldRow id="gp_email" label="GP email">
                    <Input id="gp_email" type="email" value={data.gp_email} onChange={(e) => update({ gp_email: e.target.value })} />
                  </FieldRow>
                </div>
                <FieldRow id="specialists" label="Specialists (name, specialty, clinic — one per line)">
                  <Textarea id="specialists" rows={4} value={data.specialists} onChange={(e) => update({ specialists: e.target.value })} />
                </FieldRow>
              </AccordionContent>
            </AccordionItem>

            {/* Section 3 */}
            <AccordionItem value="reason" className="rounded-2xl border border-border bg-card/70 px-4">
              <AccordionTrigger className="text-left">3. Reason for engaging CareBridge</AccordionTrigger>
              <AccordionContent className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label className="text-sm">Services you're interested in</Label>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {INTAKE_SERVICES.map((svc) => {
                      const checked = data.services_interested.includes(svc);
                      return (
                        <label
                          key={svc}
                          className="flex items-center gap-2 rounded-xl border border-border bg-background/40 px-3 py-2 cursor-pointer hover:border-primary/40"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleService(svc)}
                            aria-label={svc}
                          />
                          <span className="text-sm">{svc}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
                <FieldRow id="help_needed" label="In your own words, what do you need help with?">
                  <Textarea id="help_needed" rows={4} value={data.help_needed} onChange={(e) => update({ help_needed: e.target.value })} />
                </FieldRow>
                <FieldRow id="main_outcome" label="What is the main outcome you want?">
                  <Textarea id="main_outcome" rows={3} value={data.main_outcome} onChange={(e) => update({ main_outcome: e.target.value })} />
                </FieldRow>
              </AccordionContent>
            </AccordionItem>

            {/* Section 4 */}
            <AccordionItem value="concerns" className="rounded-2xl border border-border bg-card/70 px-4">
              <AccordionTrigger className="text-left">4. Current health concerns</AccordionTrigger>
              <AccordionContent className="space-y-4 pt-2">
                <FieldRow id="main_concerns" label="Main symptoms or health concerns (most recent first)">
                  <Textarea id="main_concerns" rows={5} value={data.main_concerns} onChange={(e) => update({ main_concerns: e.target.value })} />
                </FieldRow>
                <FieldRow id="concerns_onset" label="When did these begin?">
                  <Input id="concerns_onset" value={data.concerns_onset} onChange={(e) => update({ concerns_onset: e.target.value })} placeholder="e.g. March 2024" />
                </FieldRow>
              </AccordionContent>
            </AccordionItem>

            {/* Section 5 */}
            <AccordionItem value="history" className="rounded-2xl border border-border bg-card/70 px-4">
              <AccordionTrigger className="text-left">5. Medical history</AccordionTrigger>
              <AccordionContent className="space-y-4 pt-2">
                <FieldRow id="diagnosed_conditions" label="Diagnosed conditions">
                  <Textarea id="diagnosed_conditions" rows={3} value={data.diagnosed_conditions} onChange={(e) => update({ diagnosed_conditions: e.target.value })} />
                </FieldRow>
                <FieldRow id="current_medications" label="Current medications (name, dose, frequency)">
                  <Textarea id="current_medications" rows={3} value={data.current_medications} onChange={(e) => update({ current_medications: e.target.value })} />
                </FieldRow>
                <FieldRow id="allergies" label="Allergies">
                  <Textarea id="allergies" rows={2} value={data.allergies} onChange={(e) => update({ allergies: e.target.value })} />
                </FieldRow>
                <FieldRow id="recent_investigations" label="Recent investigations (scans, blood tests, results)">
                  <Textarea id="recent_investigations" rows={3} value={data.recent_investigations} onChange={(e) => update({ recent_investigations: e.target.value })} />
                </FieldRow>
              </AccordionContent>
            </AccordionItem>

            {/* Section 6 */}
            <AccordionItem value="admin" className="rounded-2xl border border-border bg-card/70 px-4">
              <AccordionTrigger className="text-left">6. Administrative</AccordionTrigger>
              <AccordionContent className="space-y-4 pt-2">
                <FieldRow id="referral_source" label="How did you hear about CareBridge?">
                  <Input id="referral_source" value={data.referral_source} onChange={(e) => update({ referral_source: e.target.value })} />
                </FieldRow>
                <FieldRow id="preferred_contact_method" label="Preferred contact method">
                  <Select
                    value={data.preferred_contact_method || undefined}
                    onValueChange={(v) => update({ preferred_contact_method: v as IntakeContactMethod })}
                  >
                    <SelectTrigger id="preferred_contact_method">
                      <SelectValue placeholder="Select…" />
                    </SelectTrigger>
                    <SelectContent>
                      {INTAKE_CONTACT_METHODS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldRow>
                <FieldRow id="other_info" label="Anything else you'd like us to know?">
                  <Textarea id="other_info" rows={4} value={data.other_info} onChange={(e) => update({ other_info: e.target.value })} />
                </FieldRow>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}

        <div className="flex flex-col sm:flex-row gap-3 sm:justify-end pt-2">
          <Button variant="outline" onClick={() => save(data)} disabled={saving}>
            Save draft
          </Button>
          <Button onClick={onSubmit} disabled={submitting || loading}>
            {submitted ? "Re-submit" : "Submit intake"}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Your information is encrypted and stored securely in Australia. Only your advocate can
          see it.
        </p>
      </div>
    </AppShell>
  );
}
