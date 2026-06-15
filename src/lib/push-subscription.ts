// Web Push subscription helpers.
//
// Platform reality: Web Push works on Android Chrome, desktop Chrome/Edge/
// Firefox, and iOS Safari only when the app is installed via Add to Home
// Screen on iOS 16.4 or later. On unsupported platforms `isPushSupported()`
// returns false and all UI surfaces auto-hide.
//
// The service worker is intentionally NOT registered inside the Lovable
// preview iframe — service workers in iframes cause stale-content + nav
// interception issues. Production registers normally.

import { supabase } from "@/integrations/supabase/client";

export function isPushSupported(): boolean {
  if (typeof window === "undefined") return false;
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function getPermission(): NotificationPermission {
  if (typeof window === "undefined" || !("Notification" in window)) return "denied";
  return Notification.permission;
}

function isPreviewContext(): boolean {
  if (typeof window === "undefined") return true;
  let inIframe = false;
  try { inIframe = window.self !== window.top; } catch { inIframe = true; }
  const host = window.location.hostname;
  const isPreviewHost = host.includes("id-preview--") || host.includes("lovableproject.com");
  return inIframe || isPreviewHost;
}

let swRegistrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

export function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return Promise.resolve(null);
  if (isPreviewContext()) return Promise.resolve(null);
  if (swRegistrationPromise) return swRegistrationPromise;
  swRegistrationPromise = navigator.serviceWorker
    .register("/sw.js", { scope: "/" })
    .catch((err) => {
      console.warn("[push] sw register failed", err);
      return null;
    });
  return swRegistrationPromise;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function fetchVapidPublicKey(): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke("get-vapid-public-key", {});
    if (error) {
      console.warn("[push] vapid key fetch failed", error);
      return null;
    }
    return (data as { key?: string })?.key ?? null;
  } catch (err) {
    console.warn("[push] vapid key fetch threw", err);
    return null;
  }
}

export async function currentEndpoint(): Promise<string | null> {
  if (!isPushSupported() || isPreviewContext()) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager.getSubscription();
    return sub?.endpoint ?? null;
  } catch {
    return null;
  }
}

/**
 * Request permission (if needed), subscribe via PushManager, and upsert the
 * subscription row. Returns `{ ok: true }` on success, otherwise `{ ok: false,
 * reason }` where `reason` is one of: "unsupported", "denied", "no-vapid",
 * "no-sw", "error".
 */
export type SubscribeResult = { ok: boolean; reason?: string; detail?: string };

export async function subscribeAndStore(userId: string): Promise<SubscribeResult> {
  if (!isPushSupported()) return { ok: false, reason: "unsupported" };
  if (isPreviewContext()) return { ok: false, reason: "unsupported", detail: "preview" };

  let perm = Notification.permission;
  if (perm === "default") {
    perm = await Notification.requestPermission();
  }
  if (perm !== "granted") return { ok: false, reason: "denied" };

  const reg = await registerServiceWorker();
  if (!reg) return { ok: false, reason: "no-sw" };
  // Some browsers need the SW to be ready before subscribing.
  await navigator.serviceWorker.ready.catch(() => undefined);

  const vapidKey = await fetchVapidPublicKey();
  if (!vapidKey) return { ok: false, reason: "no-vapid" };

  let sub: PushSubscription;
  try {
    const appKey = urlBase64ToUint8Array(vapidKey);
    sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: appKey.buffer.slice(appKey.byteOffset, appKey.byteOffset + appKey.byteLength) as ArrayBuffer,
    }));
  } catch (err) {
    return { ok: false, reason: "error", detail: String((err as Error)?.message ?? err) };
  }

  const json = sub.toJSON() as { endpoint?: string; keys?: Record<string, string> };
  if (!json.endpoint || !json.keys) return { ok: false, reason: "error", detail: "bad-sub" };

  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      {
        user_id: userId,
        endpoint: json.endpoint,
        keys: json.keys,
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
        is_active: true,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" }
    );
  if (error) return { ok: false, reason: "error", detail: error.message };

  return { ok: true };
}

export async function unsubscribeLocally(): Promise<void> {
  if (!isPushSupported() || isPreviewContext()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe().catch(() => undefined);
      await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
    }
  } catch (err) {
    console.warn("[push] unsubscribe failed", err);
  }
}
