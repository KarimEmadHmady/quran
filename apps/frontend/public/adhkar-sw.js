/*
 * Adhkar reminders service worker. Its ONLY job is notifications:
 *  - it lets the page show a notification that stays clickable after the tab is in the background;
 *  - a click focuses an open app window (or opens one) on the adhkar page from the notification.
 * It has NO fetch handler: it never intercepts, caches or changes any request of the app.
 * It cannot schedule anything by itself (no push server): reminders fire from the open app.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const raw = event.notification.data && event.notification.data.url;
  // Only internal adhkar pages.
  const path = typeof raw === 'string' && /^\/adhkar(\/[0-9]{1,5})?$/.test(raw) ? raw : '/adhkar';
  const target = new URL(path, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        await client.focus();
        if ('navigate' in client) {
          try {
            await client.navigate(target);
            return;
          } catch {
            // uncontrolled client: tell the page to navigate itself
          }
        }
        client.postMessage({ type: 'adhkar-navigate', url: path });
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});
