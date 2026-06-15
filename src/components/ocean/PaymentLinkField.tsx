import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Copy, Link as LinkIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const sb = supabase as unknown as { from: (t: string) => any };

interface Props {
  clientId: string;
  /** Whether all required agreements are accepted; gates the action. */
  unlocked: boolean;
}

export function PaymentLinkField({ clientId, unlocked }: Props) {
  const [value, setValue] = useState("");
  const [initial, setInitial] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      const { data } = await sb
        .from("client_fee_arrangements")
        .select("external_payment_link_url")
        .eq("client_id", clientId)
        .maybeSingle();
      const v = (data?.external_payment_link_url as string) ?? "";
      setValue(v); setInitial(v);
    })();
  }, [clientId]);

  const dirty = value !== initial;

  async function save() {
    setSaving(true);
    // Upsert so it works even when no row exists yet
    const { error } = await sb
      .from("client_fee_arrangements")
      .upsert({ client_id: clientId, external_payment_link_url: value || null }, { onConflict: "client_id" });
    setSaving(false);
    if (error) {
      toast({ title: "Couldn't save", description: error.message, variant: "destructive" });
    } else {
      setInitial(value);
      toast({ title: "Payment link saved" });
    }
  }

  async function copy() {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    toast({ title: "Copied to clipboard" });
  }

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-2 text-sm">
        <LinkIcon className="h-3.5 w-3.5" /> External payment link
      </Label>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="https://buy.stripe.com/… or Square link"
          inputMode="url"
        />
        <Button type="button" variant="outline" onClick={copy} disabled={!value}>
          <Copy className="h-4 w-4" />
        </Button>
        <Button type="button" onClick={save} disabled={!dirty || saving}>Save</Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {unlocked
          ? "Copy and send this link to the client when they are ready to pay."
          : "Waiting on required agreements before payment can be sent."}
      </p>
    </div>
  );
}
