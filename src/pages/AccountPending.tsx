import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { SEO } from "@/components/SEO";

export default function AccountPending() {
  const { user, signOut } = useAuth();

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-gradient-sky">
      <SEO title="Account setup" description="Your CareBridge Perth account is being set up." />
      <div className="w-full max-w-md glass-card p-8 shadow-float text-center space-y-4">
        <h1 className="font-display text-3xl text-primary-deep">Almost there</h1>
        <p className="text-muted-foreground leading-relaxed">
          {user?.email ? (
            <>
              We signed you in as <span className="font-semibold text-foreground">{user.email}</span>, but no
              portal role has been assigned yet.
            </>
          ) : (
            <>Your account does not have a portal role yet.</>
          )}
        </p>
        <p className="text-sm text-muted-foreground">
          CareBridge Perth is invite-only. If you were expecting access, contact your advocate or support.
        </p>
        <div className="flex flex-col gap-2 pt-2">
          <Button asChild variant="outline" className="rounded-2xl">
            <Link to="/">Back to sign in</Link>
          </Button>
          <Button type="button" variant="ghost" className="rounded-2xl" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </div>
    </main>
  );
}
