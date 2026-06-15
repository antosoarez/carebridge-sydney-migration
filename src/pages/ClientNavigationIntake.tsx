import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "@/components/ui/use-toast";
import { SEO } from "@/components/SEO";
import { DICT, loadLang, saveLang, LANG_LABELS, type Lang } from "@/lib/onboarding-i18n";
import { INTAKE_DICT } from "@/lib/intake-i18n";
import { cn } from "@/lib/utils";

const TEXT_MAX = 2000;
const NOTES_MAX = 1000;

const intakeSchema = z.object({
  help_with: z.string().trim().max(TEXT_MAX).optional().nullable(),
  whats_going_on: z.string().trim().max(TEXT_MAX).optional().nullable(),
  steps_notes: z.string().trim().max(NOTES_MAX).optional().nullable(),
  matters_most: z.string().trim().max(TEXT_MAX).optional().nullable(),
});

export default function ClientNavigationIntake() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  const [lang, setLang] = useState<Lang>(loadLang());
  const [helpWith, setHelpWith] = useState("");
  const [whatsGoingOn, setWhatsGoingOn] = useState("");
  const [stepGp, setStepGp] = useState(false);
  const [stepReferral, setStepReferral] = useState(false);
  const [stepAppt, setStepAppt] = useState(false);
  const [stepsNotes, setStepsNotes] = useState("");
  const [mattersMost, setMattersMost] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const t = INTAKE_DICT[lang];
  const common = DICT[lang];

  useEffect(() => {
    if (!loading && !user) navigate("/", { replace: true });
  }, [user, loading, navigate]);

  const setLangPersist = (l: Lang) => {
    setLang(l);
    saveLang(l);
  };

  const markSeen = async () => {
    if (!user) return;
    await (supabase.from("profiles") as any)
      .update({ navigation_intake_seen_at: new Date().toISOString() })
      .eq("id", user.id);
  };

  const onSkip = async () => {
    await markSeen();
    toast({ title: t.savedDesc, description: t.skipDesc });
    navigate("/client", { replace: true });
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const parsed = intakeSchema.safeParse({
      help_with: helpWith,
      whats_going_on: whatsGoingOn,
      steps_notes: stepsNotes,
      matters_most: mattersMost,
    });
    if (!parsed.success) {
      toast({
        title: t.errorTitle,
        description: parsed.error.issues[0]?.message ?? "",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        client_id: user.id,
        language: lang,
        help_with: parsed.data.help_with || null,
        whats_going_on: parsed.data.whats_going_on || null,
        step_contacted_gp: stepGp,
        step_got_referral: stepReferral,
        step_appointment_booked: stepAppt,
        steps_notes: parsed.data.steps_notes || null,
        matters_most: parsed.data.matters_most || null,
        source: "onboarding",
      };
      const { error } = await ((supabase as any).from("client_navigation_intake")).insert(payload);
      if (error) throw error;
      await markSeen();
      toast({ title: t.saved, description: t.savedDesc });
      navigate("/client", { replace: true });
    } catch (err: any) {
      toast({ title: t.errorTitle, description: err?.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const isEmpty = useMemo(
    () =>
      !helpWith.trim() &&
      !whatsGoingOn.trim() &&
      !mattersMost.trim() &&
      !stepsNotes.trim() &&
      !stepGp &&
      !stepReferral &&
      !stepAppt,
    [helpWith, whatsGoingOn, mattersMost, stepsNotes, stepGp, stepReferral, stepAppt],
  );

  return (
    <main className="min-h-screen px-4 py-8 bg-gradient-sky font-['DM_Sans',_system-ui,_sans-serif] flex justify-center">
      <SEO title="What would you like help with? — CareBridge" description="Tell us a little about what you'd like help with, in your own words." />
      <div className="w-full max-w-xl animate-fade-in">
        <div className="mb-6 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="h-11 w-11 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-calm"
            aria-label={common.back}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex gap-1.5">
            {(["en", "es", "pt"] as Lang[]).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLangPersist(l)}
                className={cn(
                  "h-9 px-3 rounded-full text-xs font-medium transition-calm border",
                  lang === l
                    ? "border-primary bg-primary/5 text-primary-deep"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
                aria-pressed={lang === l}
              >
                {LANG_LABELS[l]}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={onSubmit} className="glass-card p-8 md:p-10 shadow-float space-y-8">
          <header className="space-y-3">
            <h1 className="font-['Cormorant_Garamond',_Georgia,_serif] text-3xl md:text-4xl text-primary-deep leading-tight">
              {t.heading}
            </h1>
            <p className="text-muted-foreground text-balance">{t.reassurance}</p>
          </header>

          <div className="space-y-2">
            <Label htmlFor="helpWith">{t.helpWithLabel}</Label>
            <Textarea
              id="helpWith"
              value={helpWith}
              onChange={(e) => setHelpWith(e.target.value.slice(0, TEXT_MAX))}
              placeholder={t.helpWithPh}
              rows={3}
              className="rounded-2xl bg-card text-base leading-relaxed"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="whatsGoingOn">{t.whatsGoingOnLabel}</Label>
            <Textarea
              id="whatsGoingOn"
              value={whatsGoingOn}
              onChange={(e) => setWhatsGoingOn(e.target.value.slice(0, TEXT_MAX))}
              placeholder={t.whatsGoingOnPh}
              rows={4}
              className="rounded-2xl bg-card text-base leading-relaxed"
            />
          </div>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium text-foreground">{t.stepsLabel}</legend>
            <p className="text-xs text-muted-foreground">{t.stepsHint}</p>
            <div className="grid gap-2">
              {[
                { v: stepGp, set: setStepGp, label: t.step_gp },
                { v: stepReferral, set: setStepReferral, label: t.step_referral },
                { v: stepAppt, set: setStepAppt, label: t.step_appointment },
              ].map(({ v, set, label }) => (
                <label
                  key={label}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl border-2 p-4 cursor-pointer transition-calm",
                    v ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={v}
                    onChange={(e) => set(e.target.checked)}
                    className="h-5 w-5 rounded accent-primary"
                  />
                  <span className="text-sm">{label}</span>
                </label>
              ))}
            </div>
            <div className="space-y-2 pt-2">
              <Label htmlFor="stepsNotes" className="text-sm text-muted-foreground">
                {t.stepsNotesLabel}
              </Label>
              <Input
                id="stepsNotes"
                value={stepsNotes}
                onChange={(e) => setStepsNotes(e.target.value.slice(0, NOTES_MAX))}
                placeholder={t.stepsNotesPh}
                className="h-12 rounded-2xl bg-card"
              />
            </div>
          </fieldset>

          <div className="space-y-2">
            <Label htmlFor="mattersMost">{t.mattersMostLabel}</Label>
            <Textarea
              id="mattersMost"
              value={mattersMost}
              onChange={(e) => setMattersMost(e.target.value.slice(0, TEXT_MAX))}
              placeholder={t.mattersMostPh}
              rows={3}
              className="rounded-2xl bg-card text-base leading-relaxed"
            />
          </div>

          <p className="text-xs text-muted-foreground">{t.privacyNote}</p>

          <div className="grid gap-3 pt-2">
            <Button
              type="submit"
              disabled={submitting || isEmpty}
              className="w-full h-14 rounded-2xl bg-gradient-ocean text-base font-semibold shadow-soft"
            >
              {submitting ? "…" : t.submit}
            </Button>
            <button
              type="button"
              onClick={onSkip}
              className="w-full h-12 rounded-2xl text-sm font-medium text-muted-foreground hover:text-foreground transition-calm"
            >
              {t.skip}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
