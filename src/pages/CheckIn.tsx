import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Cloud, Heart, Wind, Moon, Sparkles, CloudRain, ChevronLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { SEO } from "@/components/SEO";
import { useAuth } from "@/lib/auth";

type Emotion = {
  key: string;
  label: string;
  icon: typeof Cloud;
  bg: string;
  ring: string;
};

const EMOTIONS: Emotion[] = [
  { key: "calm", label: "Calm", icon: Wind, bg: "bg-[#d6e7d8]", ring: "ring-[#a8c8ad]" },
  { key: "happy", label: "Happy", icon: Sparkles, bg: "bg-[#fde9c9]", ring: "ring-[#e9c98a]" },
  { key: "tired", label: "Tired", icon: Moon, bg: "bg-[#dedaf0]", ring: "ring-[#b7afdc]" },
  { key: "anxious", label: "Anxious", icon: Cloud, bg: "bg-[#e6e1d4]", ring: "ring-[#c4bca5]" },
  { key: "overwhelmed", label: "Overwhelmed", icon: CloudRain, bg: "bg-[#f3d8d2]", ring: "ring-[#dcb1a8]" },
  { key: "sad", label: "Sad", icon: Heart, bg: "bg-[#d4e0ea]", ring: "ring-[#a8bdd0]" },
];

function playChime() {
  try {
    const AC = (window.AudioContext || (window as any).webkitAudioContext);
    if (!AC) return;
    const ctx = new AC();
    const now = ctx.currentTime;
    const tones = [329.63, 392.0, 523.25]; // E4, G4, C5
    tones.forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      const start = now + i * 0.18;
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(0.18, start + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 1.4);
      o.connect(g).connect(ctx.destination);
      o.start(start);
      o.stop(start + 1.5);
    });
    setTimeout(() => ctx.close(), 2200);
  } catch {
    /* silent */
  }
}

export default function CheckIn() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [emotion, setEmotion] = useState<Emotion | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const goBack = () => {
    const fallback = role === "advocate" ? "/advocate" : "/client";
    navigate(fallback);
  };

  const pickEmotion = (e: Emotion) => {
    setEmotion(e);
    setTimeout(() => setStep(1), 220);
  };

  const submit = async () => {
    if (!emotion) return;
    setSubmitting(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const { error } = await supabase.from("emotion_logs").insert({
      emotion: emotion.key,
      optional_note: note.trim() ? note.trim() : null,
      user_agent: navigator.userAgent.slice(0, 500),
      user_id: sessionData.session?.user.id ?? null,
    });
    setSubmitting(false);
    if (error) {
      toast.error("Something went wrong. Please try again.");
      return;
    }
    playChime();
    setStep(2);
  };

  return (
    <div className="min-h-screen bg-[#eef2ea] text-[#3b4a3f] flex items-center justify-center px-6 py-12">
      <SEO title="Check in — how are you feeling?" description="A calm, private space to share how you feel right now." />
      <main className="w-full max-w-xl">
        {step === 0 && (
          <section className="animate-fade-in text-center space-y-10">
            <div className="flex justify-start">
              <button
                onClick={goBack}
                className="inline-flex items-center gap-1.5 text-sm text-[#5b6b60] hover:text-[#3b4a3f] transition-colors px-2 py-1 -ml-2 rounded-lg hover:bg-white/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a8c8ad]"
                aria-label="Go back"
              >
                <ChevronLeft className="w-4 h-4" strokeWidth={1.5} />
                Back
              </button>
            </div>
            <h1 className="text-3xl sm:text-4xl font-light tracking-tight leading-snug">
              How are you feeling<br /> right now?
            </h1>
            <p className="mx-auto max-w-md text-sm sm:text-base leading-relaxed bg-white/60 rounded-2xl px-5 py-4 text-[#1C2B3A]">
              Your check-ins are shared with your{" "}
              <span className="font-medium text-[#8BA888]">CareBridge advocate</span>{" "}
              so they can support you. They are not a medical assessment. By continuing, you're okay with your advocate seeing what you share.
            </p>
            <div className="grid grid-cols-2 gap-4 sm:gap-5">
              {EMOTIONS.map((e) => {
                const Icon = e.icon;
                const active = emotion?.key === e.key;
                return (
                  <button
                    key={e.key}
                    onClick={() => pickEmotion(e)}
                    className={`group rounded-3xl ${e.bg} px-4 py-7 flex flex-col items-center gap-3 transition-all duration-300 ring-2 ring-transparent hover:${e.ring} hover:scale-[1.02] focus:outline-none focus-visible:ring-4 focus-visible:${e.ring} ${active ? `scale-[1.03] ring-4 ${e.ring}` : ""}`}
                    aria-label={e.label}
                  >
                    <Icon className="w-8 h-8 opacity-70" strokeWidth={1.5} />
                    <span className="text-base sm:text-lg font-medium">{e.label}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-sm text-[#7a8a7e]">Tap whichever feels closest. There's no wrong answer.</p>
          </section>
        )}

        {step === 1 && emotion && (
          <section className="animate-fade-in space-y-8 text-center">
            <div className="flex items-center justify-center gap-3">
              <span className={`inline-flex items-center gap-2 rounded-full ${emotion.bg} px-4 py-2 text-sm`}>
                <emotion.icon className="w-4 h-4" strokeWidth={1.5} />
                {emotion.label}
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-light leading-snug">
              Would you like to write down why?
            </h2>
            <p className="text-[#7a8a7e]">This is completely optional.</p>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 4000))}
              placeholder="Anything on your mind…"
              className="min-h-[180px] rounded-2xl border-0 bg-white/70 backdrop-blur p-5 text-base focus-visible:ring-2 focus-visible:ring-[#a8c8ad] shadow-sm"
            />
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                onClick={() => { setStep(0); setNote(""); }}
                className="rounded-full px-6 py-4 text-base text-[#5b6b60] hover:bg-white/60 transition"
              >
                ← Go back
              </button>
              <button
                onClick={submit}
                disabled={submitting}
                className="flex-1 rounded-full bg-[#7ea285] hover:bg-[#6f9376] disabled:opacity-60 text-white px-6 py-5 text-lg font-medium shadow-sm transition-all hover:shadow-md"
              >
                {submitting ? "Sending…" : "Done"}
              </button>
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="animate-fade-in text-center space-y-8 py-8">
            <div className="relative mx-auto w-32 h-32">
              <span className="absolute inset-0 rounded-full bg-[#a8c8ad]/40 animate-ping" />
              <div className="relative w-32 h-32 rounded-full bg-gradient-to-br from-[#a8c8ad] to-[#7ea285] flex items-center justify-center shadow-lg animate-scale-in">
                <Check className="w-16 h-16 text-white" strokeWidth={2.5} />
              </div>
            </div>
            <div className="space-y-3">
              <h2 className="text-3xl sm:text-4xl font-light">Thank you for sharing with me today.</h2>
              <p className="text-xl text-[#7ea285] font-medium">Good job. 💚</p>
            </div>
            <div className="flex flex-col items-center gap-4 pt-2">
              <button
                onClick={goBack}
                className="w-full sm:w-auto rounded-full bg-white/80 backdrop-blur px-8 py-5 text-lg font-medium text-[#3b4a3f] shadow-sm hover:bg-white hover:shadow-md transition-all"
              >
                Back to my day 🌊
              </button>
              <button
                onClick={() => { setStep(0); setEmotion(null); setNote(""); }}
                className="rounded-full px-6 py-3 text-sm text-[#5b6b60] hover:bg-white/60 transition"
              >
                Check in again
              </button>
            </div>
          </section>
        )}

        {/*
          SAFETY INVARIANT — DO NOT REMOVE OR MAKE CONDITIONAL.
          Crisis support resources MUST render for every visitor on every visit,
          on every step of this page, from the very first load.
          They must NEVER be gated by the 3-day low-mood advocate flag, by
          auth state, by the chosen emotion, or by any other trigger.
          The advocate-side flag is a separate, private nudge — it does not
          replace or delay this footer. These two systems must stay decoupled
          for client safety.
        */}
        <footer className="mt-12 rounded-2xl bg-white/60 px-5 py-4 text-center text-xs sm:text-sm leading-relaxed text-[#1C2B3A]">
          If you need to talk to someone now:{" "}
          <span className="font-medium text-[#8BA888]">Lifeline</span>{" "}
          <a href="tel:131114" className="font-medium hover:underline">13 11 14</a>{" "}
          (24/7, call or text{" "}
          <a href="tel:0477131114" className="font-medium hover:underline">0477 13 11 14</a>).{" "}
          <span className="font-medium text-[#8BA888]">Beyond Blue</span>{" "}
          <a href="tel:1300224636" className="font-medium hover:underline">1300 22 4636</a>.{" "}
          <span className="font-medium text-[#8BA888]">13YARN</span>{" "}
          <a href="tel:139276" className="font-medium hover:underline">13 92 76</a>{" "}
          for Aboriginal and Torres Strait Islander people. In an emergency, call{" "}
          <a href="tel:000" className="font-medium hover:underline">000</a>.
        </footer>
      </main>
    </div>
  );
}
