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

const HELP_OPTIONS = [
  { id: "navigate_appt", label: "Make sense of an upcoming appointment" },
  { id: "advocate_appt", label: "Have someone with me at an appointment" },
  { id: "second_opinion", label: "Get a second opinion or next steps" },
  { id: "paperwork", label: "Help with paperwork or insurance" },
  { id: "just_talk", label: "Just talk it through with someone" },
  { id: "other", label: "Something else" },
];

const CHEERS = ["Lovely.", "Got it.", "Thank you.", "Almost there.", "Wonderful.", "All done!"];

interface FormState {
  name: string;
  help: string[];          // Q1
  whatsGoingOn: string;    // Q2
  contactedGp: boolean;    // Q3
  gotReferral: boolean;    // Q3
  hasAppointment: boolean; // Q3
  stepsNotes: string;      // Q3
  mattersMost: string;     // Q4
  email: string;
  phone: string;
}

const EMPTY: FormState = {
  name: "", help: [], whatsGoingOn: "",
  contactedGp: false, gotReferral: false, hasAppointment: false, stepsNotes: "",
  mattersMost: "", email: "", phone: "",
};

export default function Intake() {
  // steps: 0 name, 1 help(Q1), 2 whats-going-on(Q2), 3 steps(Q3), 4 matters-most(Q4), 5 contact; 6 = done
  const TOTAL = 6;
  const [step, setStep] = useState(0);
  const [showCheck, setShowCheck] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const liveRef = useRef<HTMLDivElement>(null);

  const canAdvance = useMemo(() => {
    if (step === 0) return form.name.trim().length >= 1;
    if (step === 1) return form.help.length >= 1;
    if (step === 5) return /\S+@\S+\.\S+/.test(form.email);
    return true; // Q2/Q3/Q4 are optional but encouraged
  }, [step, form]);

  const cheer = (i: number) => CHEERS[Math.min(i, CHEERS.length - 1)];

  const next = async () => {
    if (!canAdvance || submitting) return;
    if (step === TOTAL - 1) { await submit(); return; }
    setShowCheck(true);
    playChime();
    if (liveRef.current) liveRef.current.textContent = cheer(step);
    setTimeout(() => { setShowCheck(false); setStep(s => s + 1); }, 1000);
  };

  const back = () => setStep(s => Math.max(0, s - 1));

  const submit = async () => {
    setSubmitting(true);
    const helpLabels = form.help
      .map(id => HELP_OPTIONS.find(h => h.id === id)?.label)
      .filter(Boolean)
      .join(", ");
    const stepsTaken = [
      form.contactedGp && "Contacted GP",
      form.gotReferral && "Got a referral",
      form.hasAppointment && "Have an appointment booked",
    ].filter(Boolean).join(", ");

    const message =
      `What I'd like help with:\n${helpLabels || "—"}\n\n` +
      `What's going on:\n${form.whatsGoingOn.trim() || "—"}\n\n` +
      `Steps taken so far:\n${stepsTaken || "None yet"}${form.stepsNotes.trim() ? ` (${form.stepsNotes.trim()})` : ""}\n\n` +
      `What matters most right now:\n${form.mattersMost.trim() || "—"}`;

    const { error } = await supabase.from("inbound_messages").insert({
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || null,
      subject: "New intake from the welcome wizard",
      message,
      intake_q1: helpLabels || null,
      intake_q2: form.whatsGoingOn.trim() || null,
      intake_q3_steps: {
        contacted_gp: form.contactedGp,
        got_referral: form.gotReferral,
        has_appointment: form.hasAppointment,
        notes: form.stepsNotes.trim() || null,
      },
      intake_q4: form.mattersMost.trim() || null,
    });
    setSubmitting(false);
    if (error) {
      if (liveRef.current) liveRef.current.textContent = "Something went wrong sending your note. Please try again.";
      return;
    }
    playChime();
    if (liveRef.current) liveRef.current.textContent = "All done. Thank you for trusting us.";
    setStep(TOTAL);
  };

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

  const firstName = form.name.split(" ")[0] || "there";

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
            A few short questions. No pressure, no jargon. You can go back any time.
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
                id="name" autoFocus value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="Your preferred name"
                className="h-14 text-lg rounded-2xl bg-secondary/40 border-0 px-5"
                aria-required="true"
              />
            </div>
          )}

          {/* Step 1 — Q1: help with */}
          {step === 1 && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Question 2 of {TOTAL}</p>
                <p className="font-display text-2xl text-primary-deep">
                  Hi {firstName} — what would you like help with?
                </p>
                <p className="text-muted-foreground mt-2 text-sm">Pick anything that fits. You can choose more than one.</p>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                {HELP_OPTIONS.map(opt => {
                  const active = form.help.includes(opt.id);
                  return (
                    <button
                      key={opt.id} type="button" onClick={() => toggleHelp(opt.id)} aria-pressed={active}
                      className={`min-h-14 rounded-2xl px-5 py-4 text-left text-sm font-medium transition-calm border-2 ${
                        active ? "border-primary bg-primary/10 text-primary-deep shadow-soft"
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

          {/* Step 2 — Q2: what's going on */}
          {step === 2 && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Question 3 of {TOTAL}</p>
                <Label htmlFor="whats-going-on" className="font-display text-2xl text-primary-deep">
                  What's going on right now, in your own words?
                </Label>
                <p className="text-muted-foreground mt-2 text-sm">However you'd describe it. There's no wrong answer.</p>
              </div>
              <Textarea
                id="whats-going-on" autoFocus value={form.whatsGoingOn}
                onChange={e => setForm({ ...form, whatsGoingOn: e.target.value })}
                placeholder="A few words about what's been happening..."
                rows={6} className="text-base rounded-2xl bg-secondary/40 border-0 p-5 resize-none"
              />
            </div>
          )}

          {/* Step 3 — Q3: steps taken */}
          {step === 3 && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Question 4 of {TOTAL}</p>
                <p className="font-display text-2xl text-primary-deep">Have you already taken any steps?</p>
                <p className="text-muted-foreground mt-2 text-sm">Tick anything you've done. It's completely fine if none apply.</p>
              </div>
              <div className="space-y-3">
                {([
                  ["contactedGp", "I've contacted my GP"],
                  ["gotReferral", "I've got a referral"],
                  ["hasAppointment", "I have an appointment booked"],
                ] as const).map(([key, label]) => {
                  const active = form[key] as boolean;
                  return (
                    <button
                      key={key} type="button"
                      onClick={() => setForm(f => ({ ...f, [key]: !f[key] }))}
                      aria-pressed={active}
                      className={`w-full min-h-14 rounded-2xl px-5 py-4 text-left text-sm font-medium transition-calm border-2 ${
                        active ? "border-primary bg-primary/10 text-primary-deep shadow-soft"
                               : "border-transparent bg-secondary/40 hover:bg-secondary/70 text-foreground"
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        <span className={`h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 ${
                          active ? "border-primary bg-primary" : "border-muted-foreground/40"
                        }`}>
                          {active && <Check className="h-3 w-3 text-primary-foreground stroke-[3]" />}
                        </span>
                        <span className="flex-1">{label}</span>
                      </span>
                    </button>
                  );
                })}
                <Textarea
                  value={form.stepsNotes}
                  onChange={e => setForm({ ...form, stepsNotes: e.target.value })}
                  placeholder="Anything to add about the steps so far? (optional)"
                  rows={3} className="text-base rounded-2xl bg-secondary/40 border-0 p-5 resize-none mt-2"
                />
              </div>
            </div>
          )}

          {/* Step 4 — Q4: matters most */}
          {step === 4 && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Question 5 of {TOTAL}</p>
                <Label htmlFor="matters-most" className="font-display text-2xl text-primary-deep">
                  What matters most to you right now?
                </Label>
                <p className="text-muted-foreground mt-2 text-sm">This helps us focus on what you really need.</p>
              </div>
              <Textarea
                id="matters-most" autoFocus value={form.mattersMost}
                onChange={e => setForm({ ...form, mattersMost: e.target.value })}
                placeholder="The one thing that would help the most..."
                rows={5} className="text-base rounded-2xl bg-secondary/40 border-0 p-5 resize-none"
              />
            </div>
          )}

          {/* Step 5 — contact */}
          {step === 5 && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Last step — {TOTAL} of {TOTAL}</p>
                <p className="font-display text-2xl text-primary-deep">How can we reach you?</p>
                <p className="text-muted-foreground mt-2 text-sm">Email is enough. A phone number is only if you'd prefer a call back.</p>
              </div>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="email" className="text-sm">Email</Label>
                  <Input
                    id="email" type="email" autoFocus value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })}
                    placeholder="you@example.com"
                    className="h-14 text-base rounded-2xl bg-secondary/40 border-0 px-5 mt-1.5"
                    aria-required="true"
                  />
                </div>
                <div>
                  <Label htmlFor="phone" className="text-sm">Phone <span className="text-muted-foreground">(optional)</span></Label>
                  <Input
                    id="phone" type="tel" value={form.phone}
                    onChange={e => setForm({ ...form, phone: e.target.value })}
                    placeholder="Only if you'd like a call"
                    className="h-14 text-base rounded-2xl bg-secondary/40 border-0 px-5 mt-1.5"
                  />
                </div>
              </div>
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
              <h2 className="font-display text-3xl text-primary-deep">All done — thank you, {firstName}.</h2>
              <p className="text-muted-foreground mt-3 max-w-md mx-auto">
                Your note is safely with us. A real human will write back to <span className="font-semibold text-foreground">{form.email}</span> within one working day.
              </p>
              <p className="text-sm text-muted-foreground mt-6">You can close this tab whenever you're ready. 💙</p>
            </div>
          )}
        </div>

        {step < TOTAL && (
          <div className="flex items-center justify-between mt-6 gap-3">
            <Button
              variant="ghost" onClick={back} disabled={step === 0 || submitting}
              className="min-h-14 rounded-2xl gap-2 px-5 text-muted-foreground hover:text-primary"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <Button
              onClick={next} disabled={!canAdvance || submitting}
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
