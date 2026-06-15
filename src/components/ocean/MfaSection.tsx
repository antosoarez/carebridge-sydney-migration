import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";
import { ShieldCheck, ShieldOff, Smartphone, KeyRound, Copy, Download, Monitor, Trash2 } from "lucide-react";
import { generateRecoveryCodes, countActiveRecoveryCodes } from "@/lib/recovery-codes";
import { listTrustedDevices, revokeTrustedDevice, untrustAllDevices } from "@/lib/trusted-device";

type Factor = { id: string; status: string; friendly_name?: string | null };
type TrustedDevice = { id: string; label: string | null; expires_at: string; last_used_at: string; created_at: string };

export function MfaSection() {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [recoveryCount, setRecoveryCount] = useState<number>(0);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  const [devices, setDevices] = useState<TrustedDevice[]>([]);

  const refresh = async () => {
    setLoading(true);
    const { data } = await supabase.auth.mfa.listFactors();
    setFactors((data?.totp ?? []) as Factor[]);
    try { setRecoveryCount(await countActiveRecoveryCodes()); } catch { /* ignore */ }
    try { setDevices(await listTrustedDevices() as TrustedDevice[]); } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const startEnroll = async () => {
    setBusy(true);
    try {
      // Clean up any unverified factors first
      const { data: list } = await supabase.auth.mfa.listFactors();
      const unverified = (list?.totp ?? []).filter((f: any) => f.status !== "verified");
      for (const f of unverified) {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `CareBridge ${new Date().toLocaleDateString()}`,
      });
      if (error) throw error;
      const uri = (data as any).totp.uri ?? `otpauth://totp/CareBridge?secret=${data.totp.secret}&issuer=CareBridge`;
      const qrDataUrl = await QRCode.toDataURL(uri, { margin: 1, width: 220 });
      setEnrolling({
        factorId: data.id,
        qr: qrDataUrl,
        secret: data.totp.secret,
      });
    } catch (err: any) {
      toast({ title: "Couldn't start setup", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const verifyEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrolling) return;
    setBusy(true);
    try {
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: enrolling.factorId });
      if (chErr) throw chErr;
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId: enrolling.factorId,
        challengeId: ch.id,
        code: code.trim(),
      });
      if (vErr) throw vErr;
      toast({ title: "Two-step protection on 🔐", description: "Your account is now extra safe." });
      setEnrolling(null);
      setCode("");
      await refresh();
    } catch (err: any) {
      toast({ title: "Invalid code", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const disable = async (factorId: string) => {
    if (!confirm("Turn off two-step verification?")) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) throw error;
      toast({ title: "Two-step turned off" });
      await refresh();
    } catch (err: any) {
      toast({ title: "Couldn't disable", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const cancelEnroll = async () => {
    if (enrolling) await supabase.auth.mfa.unenroll({ factorId: enrolling.factorId });
    setEnrolling(null);
    setCode("");
  };

  const regenerate = async () => {
    if (recoveryCount > 0 && !confirm("This will replace any existing recovery codes. Continue?")) return;
    setBusy(true);
    try {
      const codes = await generateRecoveryCodes();
      setNewCodes(codes);
      await refresh();
    } catch (err: any) {
      toast({ title: "Couldn't generate codes", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const copyCodes = async () => {
    if (!newCodes) return;
    await navigator.clipboard.writeText(newCodes.join("\n"));
    toast({ title: "Copied to clipboard" });
  };

  const downloadCodes = () => {
    if (!newCodes) return;
    const blob = new Blob([`CareBridge Perth — MFA recovery codes\n\n${newCodes.join("\n")}\n\nKeep these somewhere safe. Each code works once.`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "carebridge-recovery-codes.txt"; a.click();
    URL.revokeObjectURL(url);
  };

  const verified = factors.filter((f) => f.status === "verified");

  return (
    <section className="glass-card p-6 lg:col-span-2 space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-accent" />
        <h2 className="font-display text-xl text-primary-deep">Two-step verification</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Add a 6-digit code from Google Authenticator or Microsoft Authenticator to make sign-in extra safe. Totally optional.
      </p>

      {loading ? (
        <p className="text-sm text-muted-foreground">Checking…</p>
      ) : enrolling ? (
        <div className="space-y-4 p-4 rounded-2xl bg-secondary/40">
          <p className="text-sm font-semibold text-primary-deep">Scan with your authenticator app</p>
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="bg-white p-3 rounded-2xl shadow-soft">
              <img src={enrolling.qr} alt="MFA QR code" width={220} height={220} />
            </div>
            <div className="text-xs text-muted-foreground space-y-2">
              <p>Can't scan? Enter this key manually:</p>
              <code className="block break-all p-2 rounded-lg bg-card font-mono text-[11px]">{enrolling.secret}</code>
            </div>
          </div>
          <form onSubmit={verifyEnroll} className="space-y-3">
            <Label htmlFor="totp-code">Enter the 6-digit code</Label>
            <Input
              id="totp-code"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="123 456"
              className="h-12 rounded-xl bg-card text-center text-xl tracking-[0.4em] font-semibold"
              required
            />
            <div className="flex gap-2">
              <Button type="submit" disabled={busy || code.length !== 6} className="flex-1 rounded-2xl bg-gradient-ocean h-11">
                {busy ? "Verifying…" : "Turn on"}
              </Button>
              <Button type="button" variant="ghost" onClick={cancelEnroll}>Cancel</Button>
            </div>
          </form>
        </div>
      ) : verified.length > 0 ? (
        <div className="space-y-3">
          {verified.map((f) => (
            <div key={f.id} className="flex items-center justify-between p-4 rounded-2xl bg-secondary/40">
              <div className="flex items-center gap-3">
                <Smartphone className="h-4 w-4 text-primary-deep" />
                <div>
                  <p className="font-semibold text-sm">{f.friendly_name || "Authenticator app"}</p>
                  <p className="text-xs text-muted-foreground">Active</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => disable(f.id)} disabled={busy} className="text-destructive">
                <ShieldOff className="h-4 w-4 mr-1" /> Turn off
              </Button>
            </div>
          ))}

          <div className="p-4 rounded-2xl bg-secondary/40 space-y-3">
            <div className="flex items-start gap-3">
              <KeyRound className="h-4 w-4 text-primary-deep mt-1" />
              <div className="flex-1">
                <p className="font-semibold text-sm">Recovery codes</p>
                <p className="text-xs text-muted-foreground">
                  Lost your phone? Use one of these one-time codes to sign in and reset two-step verification.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {recoveryCount > 0 ? `${recoveryCount} unused code${recoveryCount === 1 ? "" : "s"} remaining` : "No recovery codes generated yet."}
                </p>
              </div>
            </div>

            {newCodes ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-card font-mono text-sm">
                  {newCodes.map((c) => (
                    <code key={c} className="tracking-wider">{c}</code>
                  ))}
                </div>
                <p className="text-xs text-destructive font-semibold">
                  Save these now — they won't be shown again.
                </p>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="secondary" onClick={copyCodes} className="rounded-xl">
                    <Copy className="h-3.5 w-3.5 mr-1" /> Copy
                  </Button>
                  <Button type="button" size="sm" variant="secondary" onClick={downloadCodes} className="rounded-xl">
                    <Download className="h-3.5 w-3.5 mr-1" /> Download
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setNewCodes(null)} className="ml-auto">
                    I've saved them
                  </Button>
                </div>
              </div>
            ) : (
              <Button type="button" size="sm" variant="secondary" onClick={regenerate} disabled={busy} className="rounded-xl">
                <KeyRound className="h-3.5 w-3.5 mr-1" />
                {recoveryCount > 0 ? "Regenerate recovery codes" : "Generate recovery codes"}
              </Button>
            )}
          </div>

          <div className="p-4 rounded-2xl bg-secondary/40 space-y-3">
            <div className="flex items-start gap-3">
              <Monitor className="h-4 w-4 text-primary-deep mt-1" />
              <div className="flex-1">
                <p className="font-semibold text-sm">Trusted devices</p>
                <p className="text-xs text-muted-foreground">
                  Devices that skip the 6-digit code at sign-in. Revoke any you don't recognise.
                </p>
              </div>
            </div>
            {devices.length === 0 ? (
              <p className="text-xs text-muted-foreground">No trusted devices yet. Tick "Trust this device" next time you enter your code.</p>
            ) : (
              <ul className="space-y-2">
                {devices.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-card">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-primary-deep truncate">{d.label || "Device"}</p>
                      <p className="text-[11px] text-muted-foreground">
                        Expires {new Date(d.expires_at).toLocaleDateString()} · Last used {new Date(d.last_used_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-destructive shrink-0"
                      onClick={async () => { await revokeTrustedDevice(d.id); refresh(); }}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Revoke
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {devices.length > 1 && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="rounded-xl"
                onClick={async () => {
                  if (!confirm("Revoke all trusted devices? Everyone will need their 6-digit code next time.")) return;
                  await untrustAllDevices();
                  refresh();
                }}
              >
                Revoke all
              </Button>
            )}
          </div>
        </div>
      ) : (
        <Button onClick={startEnroll} disabled={busy} className="rounded-2xl bg-gradient-ocean h-11">
          <ShieldCheck className="h-4 w-4 mr-2" /> {busy ? "Setting up…" : "Set up two-step verification"}
        </Button>
      )}
    </section>
  );
}
