import { AppShell } from "@/components/ocean/AppShell";
import { PoliciesAgreementsList } from "@/components/ocean/PoliciesAgreementsList";
import { useAuth } from "@/lib/auth";

export default function ClientAgreements() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <AppShell role="client" title="Policies & Agreements">
      <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-serif text-primary-deep">
            Policies & Agreements
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Please read each document carefully and sign your required agreements. You can
            re-read any document at any time.
          </p>
        </div>
        <PoliciesAgreementsList clientId={user.id} />
      </div>
    </AppShell>
  );
}
