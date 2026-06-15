import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Calendar, Check, FileText, MessageCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "@/components/ui/use-toast";
import { SEO } from "@/components/SEO";
import { EmergencyNotice } from "@/components/ocean/EmergencyNotice";
import { DICT, type Lang, loadLang, saveLang, LANG_LABELS } from "@/lib/onboarding-i18n";
import { cn } from "@/lib/utils";

const TOTAL_STEPS = 6;
const CONTACT_METHODS = ["app", "email", "phone"] as const;
type ContactMethod = (typeof CONTACT_METHODS)[number];

export default function ClientOnboarding() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [lang, setLang] = useState<Lang>(loadLang());
  const [step, setStep] = useState(1);
  const [ackScope, setAckScope] = useState(false);
  const [ackPrivacy, setAckPrivacy] = useState(false);
  const [preferredName, setPreferredName] = useState("");
  const [preferredContact, setPreferredContact] = useState<ContactMethod>("app");
  const [submitting, setSubmitting] = useState(false);

  const t = DICT[lang];

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate("/", { replace: true });
      return;
    }
    // Skip if already onboarded
    (async () => {
      const { data } = await (supabase
        .from("profiles") as any)
        .select("onboarding_completed_at, full_name, preferred_name")
        .eq("id", user.id)
        .maybeSingle();
      if (data?.onboarding_completed_at) {
        navigate("/client", { replace: true });
        return;
      }
      if (data?.preferred_name) setPreferredName(data.preferred_name);
      else if (data?.full_name) setPreferredName(String(data.full_name).split(" ")[0] ?? "");
    })();
  }, [user, loading, navigate]);

  const setLangPersist = (l: Lang) => {
    setLang(l);
    saveLang(l);
  };

  const goBack = () => setStep((s) => Math.max(1, s - 1));
  const goNext = () => setStep((s) => Math.min(TOTAL_STEPS, s + 1));

  const canContinue = useMemo(() => {
    if (step === 2) return ackScope;
    if (step === 3) return ackPrivacy;
    if (step === 4) return preferredName.trim().length > 0;
    return true;
  }, [step, ackScope, ackPrivacy, preferredName]);

  const finish = async () => {
    if (!user) return;
    setSubmitting(true);
    try {
      // Record both consents (audit trail)
      const { error: consentErr } = await (supabase.from("client_consents") as any).insert([
        {
          user_id: user.id,
          kind: "scope_acknowledgment",
          language: lang,
          consent_text: t.s2_ack,
        },
        {
          user_id: user.id,
          kind: "privacy_consent",
          language: lang,
          consent_text: t.s3_consent,
        },
      ]);
      if (consentErr) throw consentErr;

      const { error: profileErr } = await (supabase.from("profiles") as any)
        .update({
          onboarding_completed_at: new Date().toISOString(),
          preferred_name: preferredName.trim() || null,
          preferred_language: lang,
          preferred_contact_method: preferredContact,
        })
        .eq("id", user.id);
      if (profileErr) throw profileErr;

      navigate("/client", { replace: true });
    } catch (err: any) {
      toast({
        title: "Something didn't save",
        description: err?.message ?? "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-8 bg-gradient-sky font-['DM_Sans',_system-ui,_sans-serif]">
      <SEO
        title="Welcome — CareBridge"
        description="A calm, step-by-step welcome to CareBridge."
      />
      <div className="w-full max-w-xl animate-fade-in">
        {/* Progress + language */}
        <div className="mb-6 flex items-center gap-4">
          {step > 1 ? (
            <button
              type="button"
              onClick={goBack}
              className="h-11 w-11 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-calm"
              aria-label={t.back}
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          ) : (
            <div className="h-11 w-11" aria-hidden />
          )}
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2 text-xs text-muted-foreground">
              <span>{t.step(step, TOTAL_STEPS)}</span>
            </div>
            <Progress value={(step / TOTAL_STEPS) * 100} className="h-1.5" />
          </div>
        </div>

        <div className="glass-card p-8 md:p-10 shadow-float">
          {step === 1 && (
            <section className="space-y-8 text-center">
              <div className="space-y-3">
                <h1 className="font-['Cormorant_Garamond',_Georgia,_serif] text-4xl md:text-5xl text-primary-deep leading-tight">
                  {t.s1_heading}
                </h1>
                <p className="text-muted-foreground text-balance">{t.s1_body}</p>
              </div>

              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">{t.s1_choose}</p>
                <div className="grid gap-3">
                  {(["en", "es", "pt"] as Lang[]).map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setLangPersist(l)}
                      className={cn(
                        "h-14 rounded-2xl border-2 text-base font-medium transition-calm text-left px-5 flex items-center justify-between",
                        lang === l
                          ? "border-primary bg-primary/5 text-primary-deep"
                          : "border-border bg-card hover:border-primary/40",
                      )}
                      aria-pressed={lang === l}
                    >
                      <span>{LANG_LABELS[l]}</span>
                      {lang === l && <Check className="h-5 w-5 text-primary" />}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          )}

          {step === 2 && (
            <section className="space-y-6">
              <h1 className="font-['Cormorant_Garamond',_Georgia,_serif] text-3xl md:text-4xl text-primary-deep">
                {t.s2_heading}
              </h1>
              <ul className="space-y-3">
                {t.s2_bullets.map((b, i) => (
                  <li
                    key={i}
                    className="flex gap-3 rounded-2xl bg-card/60 border border-border p-4 leading-relaxed"
                  >
                    <span
                      aria-hidden
                      className="mt-1 h-2 w-2 rounded-full bg-primary shrink-0"
                    />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              <EmergencyNotice compact />
              <label className="flex items-start gap-3 rounded-2xl border-2 border-border bg-card p-5 cursor-pointer hover:border-primary/40 transition-calm">
                <input
                  type="checkbox"
                  checked={ackScope}
                  onChange={(e) => setAckScope(e.target.checked)}
                  className="mt-1 h-5 w-5 rounded accent-primary shrink-0"
                />
                <span className="text-sm leading-relaxed">{t.s2_ack}</span>
              </label>
            </section>
          )}

          {step === 3 && (
            <section className="space-y-6">
              <h1 className="font-['Cormorant_Garamond',_Georgia,_serif] text-3xl md:text-4xl text-primary-deep">
                {t.s3_heading}
              </h1>
              <ul className="space-y-3">
                {t.s3_bullets.map((b, i) => (
                  <li
                    key={i}
                    className="flex gap-3 rounded-2xl bg-card/60 border border-border p-4 leading-relaxed"
                  >
                    <span
                      aria-hidden
                      className="mt-1 h-2 w-2 rounded-full bg-accent shrink-0"
                    />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              <a
                href="/privacy"
                target="_blank"
                rel="noreferrer"
                className="inline-block text-sm text-primary-deep underline underline-offset-4"
              >
                {t.s3_privacyLink}
              </a>
              <label className="flex items-start gap-3 rounded-2xl border-2 border-border bg-card p-5 cursor-pointer hover:border-primary/40 transition-calm">
                <input
                  type="checkbox"
                  checked={ackPrivacy}
                  onChange={(e) => setAckPrivacy(e.target.checked)}
                  className="mt-1 h-5 w-5 rounded accent-primary shrink-0"
                />
                <span className="text-sm leading-relaxed">{t.s3_consent}</span>
              </label>
            </section>
          )}

          {step === 4 && (
            <section className="space-y-6">
              <h1 className="font-['Cormorant_Garamond',_Georgia,_serif] text-3xl md:text-4xl text-primary-deep">
                {t.s4_heading}
              </h1>
              <p className="text-sm text-muted-foreground">{t.s4_note}</p>
              <div className="space-y-2">
                <Label htmlFor="preferredName">{t.s4_preferredName}</Label>
                <Input
                  id="preferredName"
                  value={preferredName}
                  onChange={(e) => setPreferredName(e.target.value)}
                  placeholder={t.s4_preferredNamePh}
                  className="h-14 rounded-2xl bg-card text-base"
                />
              </div>
              <div className="space-y-2">
                <Label>{t.s4_preferredLang}</Label>
                <div className="grid grid-cols-3 gap-2">
                  {(["en", "es", "pt"] as Lang[]).map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setLangPersist(l)}
                      className={cn(
                        "h-12 rounded-2xl border-2 text-sm font-medium transition-calm",
                        lang === l
                          ? "border-primary bg-primary/5 text-primary-deep"
                          : "border-border bg-card hover:border-primary/40",
                      )}
                    >
                      {LANG_LABELS[l]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t.s4_preferredContact}</Label>
                <div className="grid grid-cols-3 gap-2">
                  {CONTACT_METHODS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPreferredContact(m)}
                      className={cn(
                        "h-12 rounded-2xl border-2 text-sm font-medium transition-calm",
                        preferredContact === m
                          ? "border-primary bg-primary/5 text-primary-deep"
                          : "border-border bg-card hover:border-primary/40",
                      )}
                    >
                      {m === "app"
                        ? t.s4_contact_app
                        : m === "email"
                          ? t.s4_contact_email
                          : t.s4_contact_phone}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          )}

          {step === 5 && (
            <section className="space-y-6">
              <h1 className="font-['Cormorant_Garamond',_Georgia,_serif] text-3xl md:text-4xl text-primary-deep">
                {t.s5_heading}
              </h1>
              <p className="text-muted-foreground">{t.s5_intro}</p>
              <div className="grid gap-4">
                {[
                  { Icon: FileText, t: t.s5_docs_t, b: t.s5_docs_b },
                  { Icon: MessageCircle, t: t.s5_msg_t, b: t.s5_msg_b },
                  { Icon: Calendar, t: t.s5_cal_t, b: t.s5_cal_b },
                ].map(({ Icon, t: title, b }) => (
                  <div
                    key={title}
                    className="flex items-start gap-4 rounded-2xl bg-card border border-border p-5"
                  >
                    <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <Icon className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="font-semibold text-primary-deep">{title}</p>
                      <p className="text-sm text-muted-foreground">{b}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {step === 6 && (
            <section className="space-y-6 text-center">
              <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                <Sparkles className="h-8 w-8" />
              </div>
              <h1 className="font-['Cormorant_Garamond',_Georgia,_serif] text-4xl md:text-5xl text-primary-deep">
                {t.s6_heading}
              </h1>
              <p className="text-muted-foreground text-balance">{t.s6_body}</p>
              <Button
                onClick={finish}
                disabled={submitting}
                className="w-full h-14 rounded-2xl bg-gradient-ocean text-base font-semibold shadow-soft"
              >
                {submitting ? "…" : t.s6_cta}
              </Button>
            </section>
          )}

          {step < 6 && (
            <div className="mt-8">
              <Button
                onClick={goNext}
                disabled={!canContinue}
                className="w-full h-14 rounded-2xl bg-gradient-ocean text-base font-semibold shadow-soft"
              >
                {t.continue}
              </Button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
