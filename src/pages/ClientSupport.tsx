import { AppShell } from "@/components/ocean/AppShell";
import { Mail, LifeBuoy, Phone } from "lucide-react";

export default function ClientSupport() {
  return (
    <AppShell role="client" title="Help & support" subtitle="We're here if you need us — any time.">
      <div className="max-w-lg mx-auto space-y-6">
        <div className="glass-card p-6">
          <div className="h-11 w-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-3">
            <LifeBuoy className="h-5 w-5" />
          </div>
          <h2 className="font-display text-xl text-primary-deep">Stuck or need a hand?</h2>
          <p className="text-muted-foreground text-sm mt-2">
            If something isn't working or you're not sure what to do next, please reach out — a real person will help you.
          </p>
          <a href="mailto:hello@carebridgeperth.com" className="mt-4 inline-flex items-center gap-2 text-primary font-semibold hover:underline">
            <Mail className="h-4 w-4" /> hello@carebridgeperth.com
          </a>
        </div>

        <div className="glass-card p-6 bg-secondary/30">
          <div className="flex items-center gap-2 mb-2">
            <Phone className="h-4 w-4 text-accent" />
            <h3 className="font-display text-base text-primary-deep">If you need to talk to someone now</h3>
          </div>
          <p className="text-sm text-foreground leading-relaxed">
            <span className="font-medium text-[#8BA888]">Lifeline</span> <a href="tel:131114" className="hover:underline font-medium">13 11 14</a> (24/7).{" "}
            <span className="font-medium text-[#8BA888]">Beyond Blue</span> <a href="tel:1300224636" className="hover:underline font-medium">1300 22 4636</a>.{" "}
            <span className="font-medium text-[#8BA888]">13YARN</span> <a href="tel:139276" className="hover:underline font-medium">13 92 76</a>.{" "}
            In an emergency, call <a href="tel:000" className="hover:underline font-medium">000</a>.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
