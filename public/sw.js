// CareBridge push-only service worker.
//
// Intentionally narrow: only handles `push` and `notificationclick`. No
// `fetch` listener and no caches — this avoids the Lovable-preview stale-
// content problem documented in the PWA guidance.
//
// Platform reality: Web Push works on Android Chrome, desktop Chrome/Edge/
// Firefox, and iOS Safari only when the app is installed via Add to Home
// Screen on iOS 16.4 or later. The in-app prompt auto-hides where unsupported.

self.addEventListener('install', (e) => e.waitUntil(self.skipWaiting()));
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) { data = {}; }
  const title = data.title || 'New message';
  const body  = data.body  || 'Tap to read in CareBridge';
  const tag   = data.tag   || 'carebridge-message';
  const url   = data.url   || '/messages';
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/logo.png',
      badge: '/logo.png',
      tag,
      renotify: true,
      data: { url },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(
    (event.notification.data && event.notification.data.url) || '/messages',
    self.location.origin
  ).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const match = all.find((c) => c.url.startsWith(self.location.origin));
    if (match) {
      try { await match.focus(); } catch (_) {}
      if (typeof match.navigate === 'function') {
        try { await match.navigate(target); } catch (_) {}
      }
      return;
    }
    await self.clients.openWindow(target);
  })());
});
