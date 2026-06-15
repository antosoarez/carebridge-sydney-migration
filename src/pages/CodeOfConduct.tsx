import { AppShell } from "@/components/ocean/AppShell";
import { Mail, Phone, Globe, ShieldCheck, Heart } from "lucide-react";

export default function CodeOfConduct() {
  return (
    <AppShell
      role="client"
      title="Code of Conduct & Complaints"
      subtitle="How we work with you — and how to raise a concern if something isn't right."
      seoTitle="Code of Conduct & Complaints — CareBridge Perth"
      seoDescription="CareBridge Perth's code of conduct and complaints process, including HaDSCO contact details."
    >
      <div className="space-y-6 max-w-3xl">
        <section className="glass-card p-6 md:p-8 space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-accent" />
            <h2 className="font-display text-2xl text-primary-deep">Our Code of Conduct</h2>
          </div>
          <p className="text-muted-foreground">
            CareBridge Perth is committed to providing safe, respectful, and person-centred advocacy.
            In every interaction, we promise to:
          </p>
          <ul className="space-y-3 text-sm md:text-base">
            <li className="flex gap-3"><span className="text-accent mt-1">•</span><span>Treat every person with <strong>dignity, respect, and fairness</strong>.</span></li>
            <li className="flex gap-3"><span className="text-accent mt-1">•</span><span>Protect your <strong>privacy</strong> and keep your information confidential.</span></li>
            <li className="flex gap-3"><span className="text-accent mt-1">•</span><span>Communicate <strong>clearly and honestly</strong>, in plain language.</span></li>
            <li className="flex gap-3"><span className="text-accent mt-1">•</span><span>Respect your <strong>cultural background, identity, and preferences</strong>.</span></li>
            <li className="flex gap-3"><span className="text-accent mt-1">•</span><span>Maintain <strong>professional boundaries</strong> at all times.</span></li>
            <li className="flex gap-3"><span className="text-accent mt-1">•</span><span>Work in your <strong>best interest</strong> and support your informed choices.</span></li>
            <li className="flex gap-3"><span className="text-accent mt-1">•</span><span>Never discriminate, exploit, or pressure you into any decision.</span></li>
          </ul>
        </section>

        <section className="glass-card p-6 md:p-8 space-y-4">
          <div className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-accent" />
            <h2 className="font-display text-2xl text-primary-deep">Complaints</h2>
          </div>
          <p>
            If something isn't right, we want to know. If you have a concern about CareBridge or
            the service you received, please contact us directly first at{" "}
            <a href="mailto:hello@carebridgeperth.com" className="text-primary-deep underline underline-offset-4 font-semibold">
              hello@carebridgeperth.com
            </a>
            . We will respond within <strong>5 business days</strong>.
          </p>
          <p className="text-muted-foreground">
            If you are not satisfied with our response, or if you prefer to raise your concern
            independently, you have the right to contact HaDSCO.
          </p>

          <div className="rounded-2xl bg-gradient-sky p-5 md:p-6 mt-2 space-y-3">
            <h3 className="font-display text-lg text-primary-deep">
              Health and Disability Services Complaints Office (HaDSCO)
            </h3>
            <p className="text-sm text-muted-foreground">
              HaDSCO is the independent body that handles complaints about health and disability
              services in Western Australia, including unregistered health care workers.
            </p>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-accent shrink-0" />
                <a
                  href="https://www.hadsco.wa.gov.au"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-deep underline underline-offset-4"
                >
                  hadsco.wa.gov.au
                </a>
              </li>
              <li className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-accent shrink-0" />
                <a href="tel:1800813583" className="text-primary-deep underline underline-offset-4">
                  1800 813 583
                </a>
                <span className="text-muted-foreground">(free call)</span>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-accent shrink-0" />
                <a href="mailto:hadsco@hadsco.wa.gov.au" className="text-primary-deep underline underline-offset-4">
                  hadsco@hadsco.wa.gov.au
                </a>
              </li>
            </ul>
            <p className="text-xs text-muted-foreground pt-1">
              Complaints are <strong>free</strong>, <strong>confidential</strong>, and do not
              require a lawyer.
            </p>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
