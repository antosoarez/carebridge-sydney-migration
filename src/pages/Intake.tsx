import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { SEO } from "@/components/SEO";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/ocean/Logo";
import { ArrowLeft, ArrowRight, Check, Loader2, Sparkles } from "lucide-react";

/* ---------- gentle chime via Web Audio ---------- */
function playChime() {
  try {
    const AC = (window.AudioContext || (window as any).webkitAudioContext);
    if (!AC) return;
    const ctx = new AC();
    const now = ctx.currentTime;
    // soft two-note bell: E5 -> G5
    const notes = [659.25, 783.99];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = now + i * 0.12;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.15, start + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.9);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 1);
    });
    setTimeout(() => ctx.close(), 1500);
  } catch {/* silent */}
}

/* ---------- animated checkmark burst ---------- */
function CheckBurst({ message }: { message: string }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-card/90 backdrop-blur-sm rounded-[2rem] animate-fade-in">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-success/20 animate-ping" />
        <div className="relative h-28 w-28 rounded-full bg-gradient-to-br from-success/80 to-success flex items-center justify-center shadow-soft animate-scale-in">
          <Check className="h-14 w-14 text-success-foreground stroke-[3]" strokeLinecap="round" />
        </div>
      </div>
      <p className="mt-6 font-display text-2xl text-primary-deep animate-fade-in">{message}</p>
    </div>
  );
}

/* ---------- progress dots ---------- */
function Progress({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-2" aria-label={`Step ${step + 1} of ${total}`}>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`h-2 rounded-full transition-all duration-500 ${
            i < step ? "w-6 bg-success/70" : i === step ? "w-10 bg-primary" : "w-6 bg-muted"
          }`}
        />
      ))}
    </div>
  );
}

/* ---------- step content ---------- */
const HELP_OPTIONS = [
  { id: "navigate_appt", label: "Make sense of an upcoming appointment" },
  { id: "advocate_appt", label: "Have someone with me at an appointment" },
  { id: "second_opinion", label: "Get a second opinion or next steps" },
  { id: "paperwork", label: "Help with paperwork or insurance" },
  { id: "just_talk", label: "Just talk it through with someone" },
  { id: "other", label: "Something else" },
];

const CHEERS = ["Lovely.", "Got it.", "Wonderful.", "All done!"];

interface FormState {
  name: string;
  help: string[];
  email: string;
  phone: string;
  details: string;
}

export default function Intake() {
  const [step, setStep] = useState(0); // 0..3 = questions, 4 = done
  const [showCheck, setShowCheck] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<FormState>({ name: "", help: [], email: "", phone: "", details: "" });
  const liveRef = useRef<HTMLDivElement>(null);

  const TOTAL = 4;

  const canAdvance = useMemo(() => {
    if (step === 0) return form.name.trim().length >= 1;
    if (step === 1) return form.help.length >= 1;
    if (step === 2) return /\S+@\S+\.\S+/.test(form.email);
    return true;
  }, [step, form]);

  const cheer = (i: number) => CHEERS[Math.min(i, CHEERS.length - 1)];

  const next = async () => {
    if (!canAdvance || submitting) return;
    if (step === TOTAL - 1) {
      await submit();
      return;
    }
    setShowCheck(true);
    playChime();
    if (liveRef.current) liveRef.current.textContent = cheer(step);
    setTimeout(() => {
      setShowCheck(false);
      setStep(s => s + 1);
    }, 1100);
  };

  const back = () => setStep(s => Math.max(0, s - 1));

  const submit = async () => {
    setSubmitting(true);
    const helpLabels = form.help.map(id => HELP_OPTIONS.find(h => h.id === id)?.label).filter(Boolean).join(", ");
    const message =
      `What I'd like help with:\n${helpLabels}\n\n` +
      (form.details.trim() ? `More from me:\n${form.details.trim()}` : "No extra notes — happy to chat.");
    const { error } = await supabase.from("inbound_messages").insert({
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || null,
      subject: "New intake from the welcome wizard",
      message,
    });
    setSubmitting(false);
    if (error) {
      if (liveRef.current) liveRef.current.textContent = "Something went wrong sending your note. Please try again.";
      return;
    }
    playChime();
    if (liveRef.current) liveRef.current.textContent = "All done. Thank you for trusting us.";
    setStep(TOTAL); // success screen
  };

  // keyboard: Enter to advance from inputs
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey && step < TOTAL && canAdvance) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag !== "TEXTAREA") { e.preventDefault(); next(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, canAdvance, form, submitting]);

  const toggleHelp = (id: string) => {
    setForm(f => ({ ...f, help: f.help.includes(id) ? f.help.filter(x => x !== id) : [...f.help, id] }));
  };

  return (
    <div className="min-h-screen bg-gradient-sky">
      <SEO
        title="Get in touch — CareBridge intake"
        description="A calm, step-by-step way to reach a CareBridge patient advocate. No accounts, no rush."
      />
      <div ref={liveRef} role="status" aria-live="polite" className="sr-only" />

      <header className="px-6 pt-8 pb-4 flex items-center justify-between max-w-2xl mx-auto">
        <Link to="/" aria-label="CareBridge home"><Logo /></Link>
        <Link to="/" className="text-sm text-muted-foreground hover:text-primary">Sign in</Link>
      </header>

      <main className="px-5 pb-16 max-w-2xl mx-auto">
        <div className="text-center mb-8 mt-4">
          <span className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.2em] text-primary/80 mb-3">
            <Sparkles className="h-3.5 w-3.5" /> A gentle hello
          </span>
          <h1 className="font-display text-3xl sm:text-4xl text-primary-deep leading-tight">
            Let's take this one small step at a time.
          </h1>
          <p className="text-muted-foreground mt-3 max-w-md mx-auto">
            Four short questions. No pressure, no jargon. You can go back any time.
          </p>
        </div>

        {step < TOTAL && (
          <div className="mb-8"><Progress step={step} total={TOTAL} /></div>
        )}

        <div className="relative glass-card p-8 sm:p-10 min-h-[360px] bg-card/80 border-0 rounded-[2rem] shadow-soft">
          {showCheck && <CheckBurst message={cheer(step)} />}

          {/* Step 0 — name */}
          {step === 0 && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Question 1 of {TOTAL}</p>
                <Label htmlFor="name" className="font-display text-2xl text-primary-deep">
                  What would you like us to call you?
                </Label>
                <p className="text-muted-foreground mt-2 text-sm">Whatever feels right — first name, nickname, anything.</p>
              </div>
              <Input
                id="name"
                autoFocus
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="Your preferred name"
                className="h-14 text-lg rounded-2xl bg-secondary/40 border-0 px-5"
                aria-required="true"
              />
            </div>
          )}

          {/* Step 1 — help */}
          {step === 1 && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Question 2 of {TOTAL}</p>
                <p className="font-display text-2xl text-primary-deep">
                  Hi {form.name.split(" ")[0] || "there"} — what do you need help with?
                </p>
                <p className="text-muted-foreground mt-2 text-sm">Pick anything that fits. You can choose more than one.</p>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                {HELP_OPTIONS.map(opt => {
                  const active = form.help.includes(opt.id);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => toggleHelp(opt.id)}
                      aria-pressed={active}
                      className={`min-h-14 rounded-2xl px-5 py-4 text-left text-sm font-medium transition-calm border-2 ${
                        active
                          ? "border-primary bg-primary/10 text-primary-deep shadow-soft"
                          : "border-transparent bg-secondary/40 hover:bg-secondary/70 text-foreground"
                      }`}
                    >
                      <span className="flex items-start gap-3">
                        <span className={`mt-0.5 h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                          active ? "border-primary bg-primary" : "border-muted-foreground/40"
                        }`}>
                          {active && <Check className="h-3 w-3 text-primary-foreground stroke-[3]" />}
                        </span>
                        <span className="flex-1">{opt.label}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 2 — contact */}
          {step === 2 && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Question 3 of {TOTAL}</p>
                <p className="font-display text-2xl text-primary-deep">How can we reach you?</p>
                <p className="text-muted-foreground mt-2 text-sm">Email is enough. A phone number is only if you'd prefer a call back.</p>
              </div>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="email" className="text-sm">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoFocus
                    value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })}
                    placeholder="you@example.com"
                    className="h-14 text-base rounded-2xl bg-secondary/40 border-0 px-5 mt-1.5"
                    aria-required="true"
                  />
                </div>
                <div>
                  <Label htmlFor="phone" className="text-sm">Phone <span className="text-muted-foreground">(optional)</span></Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={form.phone}
                    onChange={e => setForm({ ...form, phone: e.target.value })}
                    placeholder="Only if you'd like a call"
                    className="h-14 text-base rounded-2xl bg-secondary/40 border-0 px-5 mt-1.5"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 3 — anything else */}
          {step === 3 && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Last question — {TOTAL} of {TOTAL}</p>
                <Label htmlFor="details" className="font-display text-2xl text-primary-deep">
                  Anything else you'd like us to know?
                </Label>
                <p className="text-muted-foreground mt-2 text-sm">Totally optional. Skip if you'd rather chat in person.</p>
              </div>
              <Textarea
                id="details"
                value={form.details}
                onChange={e => setForm({ ...form, details: e.target.value })}
                placeholder="A few words, a paragraph, or nothing at all..."
                rows={6}
                className="text-base rounded-2xl bg-secondary/40 border-0 p-5 resize-none"
              />
            </div>
          )}

          {/* Done */}
          {step === TOTAL && (
            <div className="text-center py-6 animate-fade-in">
              <div className="relative inline-block mb-6">
                <div className="absolute inset-0 rounded-full bg-success/20 animate-ping" />
                <div className="relative h-24 w-24 rounded-full bg-gradient-to-br from-success/80 to-success flex items-center justify-center shadow-soft animate-scale-in">
                  <Check className="h-12 w-12 text-success-foreground stroke-[3]" />
                </div>
              </div>
              <h2 className="font-display text-3xl text-primary-deep">All done — thank you, {form.name.split(" ")[0] || "friend"}.</h2>
              <p className="text-muted-foreground mt-3 max-w-md mx-auto">
                Your note is safely with us. A real human will write back to <span className="font-semibold text-foreground">{form.email}</span> within one working day.
              </p>
              <p className="text-sm text-muted-foreground mt-6">You can close this tab whenever you're ready. 💙</p>
            </div>
          )}
        </div>

        {/* Navigation */}
        {step < TOTAL && (
          <div className="flex items-center justify-between mt-6 gap-3">
            <Button
              variant="ghost"
              onClick={back}
              disabled={step === 0 || submitting}
              className="min-h-14 rounded-2xl gap-2 px-5 text-muted-foreground hover:text-primary"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <Button
              onClick={next}
              disabled={!canAdvance || submitting}
              className="min-h-14 rounded-2xl px-7 gap-2 bg-gradient-ocean shadow-soft text-base"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {step === TOTAL - 1 ? (submitting ? "Sending..." : "Send it") : "Continue"}
              {!submitting && step < TOTAL - 1 && <ArrowRight className="h-4 w-4" />}
            </Button>
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground mt-10 max-w-sm mx-auto">
          Your answers go straight to a private inbox. No accounts, no tracking, no spam.
        </p>
      </main>
    </div>
  );
}
