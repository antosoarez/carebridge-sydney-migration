import { useState } from "react";
import { Link } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/ocean/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";
import { SEO } from "@/components/SEO";
import { CheckCircle2, Mail, Phone } from "lucide-react";

const SUPPORT_EMAIL = "hello@carebridgeperth.com";

const contactSchema = z.object({
  name: z.string().trim().min(1, "Please share your name").max(120),
  email: z.string().trim().email("Please enter a valid email").max(255),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  subject: z.string().trim().max(200).optional().or(z.literal("")),
  message: z.string().trim().min(10, "A few more words please").max(5000),
});

export default function Contact() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", subject: "", message: "" });
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = contactSchema.safeParse(form);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      toast({ title: "Almost there", description: first.message, variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from("inbound_messages").insert({
        name: parsed.data.name,
        email: parsed.data.email,
        phone: parsed.data.phone || null,
        subject: parsed.data.subject || null,
        message: parsed.data.message,
        user_agent: navigator.userAgent.slice(0, 500),
      });
      if (error) throw error;
      setSent(true);
    } catch (err: any) {
      toast({ title: "Couldn't send", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-sky">
      <SEO
        title="Contact CareBridge Perth"
        description="Send a message to CareBridge Perth — health advocacy and care navigation in Perth, WA. We reply within one business day."
      />
      <header className="px-6 md:px-12 py-6 flex items-center justify-between">
        <Link to="/" aria-label="CareBridge Perth home"><Logo /></Link>
        <Link to="/" className="text-sm font-semibold text-primary-deep hover:underline">Sign in</Link>
      </header>

      <div className="px-6 md:px-12 pb-16 max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="font-display text-4xl md:text-5xl text-primary-deep">Get in touch</h1>
          <p className="text-muted-foreground mt-3 text-lg">
            Tell us what's on your mind. We reply within one business day — gently, never rushed.
          </p>
          <div className="mt-5 flex flex-wrap gap-4 justify-center text-sm text-muted-foreground">
            <a href={`mailto:${SUPPORT_EMAIL}`} className="inline-flex items-center gap-2 hover:text-primary-deep">
              <Mail className="h-4 w-4" /> {SUPPORT_EMAIL}
            </a>
          </div>
        </div>

        <div className="glass-card p-6 md:p-8 shadow-float animate-fade-in">
          {sent ? (
            <div className="text-center py-10 space-y-4">
              <div className="mx-auto h-14 w-14 rounded-full bg-accent/15 flex items-center justify-center">
                <CheckCircle2 className="h-7 w-7 text-accent" />
              </div>
              <h2 className="font-display text-2xl text-primary-deep">Message received 🌊</h2>
              <p className="text-muted-foreground max-w-md mx-auto">
                Thank you, {form.name.split(" ")[0] || "friend"}. We'll be in touch within one business day at {form.email}.
              </p>
              <Button
                onClick={() => { setSent(false); setForm({ name: "", email: "", phone: "", subject: "", message: "" }); }}
                variant="ghost"
                className="rounded-2xl"
              >
                Send another message
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-5" noValidate>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="c-name">Your name</Label>
                  <Input
                    id="c-name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    maxLength={120}
                    className="h-12 rounded-xl bg-card"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="c-email">Email</Label>
                  <Input
                    id="c-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    maxLength={255}
                    className="h-12 rounded-xl bg-card"
                    required
                  />
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="c-phone">Phone <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <Input
                    id="c-phone"
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    maxLength={40}
                    className="h-12 rounded-xl bg-card"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="c-subject">Subject <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <Input
                    id="c-subject"
                    value={form.subject}
                    onChange={(e) => setForm({ ...form, subject: e.target.value })}
                    maxLength={200}
                    className="h-12 rounded-xl bg-card"
                    placeholder="e.g. New client enquiry"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="c-message">How can we help?</Label>
                <Textarea
                  id="c-message"
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  maxLength={5000}
                  rows={6}
                  className="rounded-xl bg-card resize-none"
                  required
                />
                <p className="text-xs text-muted-foreground text-right">{form.message.length}/5000</p>
              </div>

              <Button
                type="submit"
                disabled={submitting}
                className="w-full h-12 rounded-2xl bg-gradient-ocean hover:opacity-90 text-base font-semibold shadow-soft hover:shadow-float transition-calm"
              >
                {submitting ? "Sending…" : "Send message"}
              </Button>

              <p className="text-xs text-center text-muted-foreground">
                By sending this you agree we'll store your message so we can reply. We never share your details.
              </p>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
