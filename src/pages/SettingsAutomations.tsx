import { AppShell } from "@/components/ocean/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useAutomationRules } from "@/lib/automation-store";

export default function SettingsAutomations() {
  const { rules, actions, loading, toggle } = useAutomationRules();

  return (
    <AppShell role="advocate">
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <div>
          <h1 className="text-2xl font-serif">Automations</h1>
          <p className="text-sm text-muted-foreground">
            Rules run server-side when something happens in CareBridge.
            Toggle a rule off if you want to handle a step manually.
          </p>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-3">
            {rules.map((r) => {
              const ruleActions = actions.filter((a) => a.rule_id === r.id);
              return (
                <Card key={r.id} className={r.enabled ? "" : "opacity-60"}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center justify-between gap-2">
                      <span>{r.name}</span>
                      <Switch
                        checked={r.enabled}
                        onCheckedChange={(v) => toggle(r.id, v)}
                        aria-label={`Toggle ${r.name}`}
                      />
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="text-xs">
                      <Badge variant="outline" className="mr-2">
                        when: {r.trigger_kind}
                      </Badge>
                      {Object.keys(r.trigger_config || {}).length > 0 && (
                        <span className="text-muted-foreground">
                          {Object.entries(r.trigger_config).map(([k, v]) => `${k}=${String(v)}`).join(", ")}
                        </span>
                      )}
                    </div>
                    <ul className="text-sm list-disc list-inside text-muted-foreground space-y-0.5">
                      {ruleActions.map((a) => (
                        <li key={a.id}>
                          {a.action_kind}
                          {Object.keys(a.action_config || {}).length > 0 && (
                            <span className="text-xs ml-1">
                              ({Object.entries(a.action_config).map(([k, v]) => `${k}: ${String(v)}`).join(", ")})
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
