import { AppShell } from "@/components/ocean/AppShell";
import { ClientAgreementsPanel } from "@/components/ocean/ClientAgreementsPanel";
import { useAuth } from "@/lib/auth";

export default function ClientAgreements() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <AppShell role="client">
      <div className="max-w-2xl mx-auto p-4 space-y-4">
        <div>
          <h1 className="text-2xl font-serif">Agreements</h1>
          <p className="text-sm text-muted-foreground">
            Please review and accept the following so we can begin paid work together.
            You can read each one before ticking the box.
          </p>
        </div>
        <ClientAgreementsPanel clientId={user.id} asAdvocate />
      </div>
    </AppShell>
  );
}
