// Shared helper: write an in-app notification row for a user, honoring
// their per-user toggle (notification_settings.inapp_enabled). Safe to
// call from any edge function. Never includes advocate-private data —
// callers must already pass client-safe title/body.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

export type InAppNotificationInput = {
  user_id: string
  user_role: 'client' | 'advocate'
  kind: string
  title: string
  body?: string | null
  link?: string | null
  metadata?: Record<string, unknown>
}

export async function insertInAppNotification(
  supabase: SupabaseClient,
  input: InAppNotificationInput,
): Promise<{ ok: boolean; skipped?: string; error?: string }> {
  try {
    const { data: prefs } = await supabase
      .from('notification_settings')
      .select('inapp_enabled')
      .eq('user_id', input.user_id)
      .maybeSingle()
    if (prefs && prefs.inapp_enabled === false) {
      return { ok: false, skipped: 'toggle_off' }
    }
    const { error } = await supabase.from('notifications').insert({
      user_id: input.user_id,
      user_role: input.user_role,
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
      metadata: input.metadata ?? {},
    })
    if (error) {
      console.error('inapp notification insert failed', error)
      return { ok: false, error: error.message }
    }
    return { ok: true }
  } catch (err) {
    console.error('inapp notification exception', err)
    return { ok: false, error: String((err as Error)?.message ?? err) }
  }
}
