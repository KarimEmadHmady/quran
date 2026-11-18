/**
 * Browser notifications for adhkar reminders (no third-party service, no push server).
 *
 * What works: while the app is open in a tab (even in the background), a reminder whose time
 * arrives shows a system notification; if the app is opened later within the grace window, the
 * missed reminder is shown once. A click opens the matching adhkar category.
 * What does not: notifying while every tab of the app is closed. That needs a push server
 * (Web Push + VAPID keys + a backend scheduler) which this project does not have; the
 * reminders page says so to the user.
 */

const SW_URL = '/adhkar-sw.js';

export type NotifyPermission = NotificationPermission | 'unsupported';

export function notificationPermission(): NotifyPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

/** Must be called from a user gesture (a click). Never asks again once denied. */
export async function requestNotificationPermission(): Promise<NotifyPermission> {
  const now = notificationPermission();
  if (now !== 'default') return now;
  try {
    return await Notification.requestPermission();
  } catch {
    return notificationPermission();
  }
}

let registration: Promise<ServiceWorkerRegistration | null> | null = null;

/** Registers the notification-only service worker (once). null when unsupported / blocked. */
export function adhkarServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (registration) return registration;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return Promise.resolve(null);
  registration = navigator.serviceWorker
    .register(SW_URL, { scope: '/' })
    .then(async (reg) => {
      // Wait (bounded) until it is active: showNotification needs an active worker.
      if (reg.active) return reg;
      const ready = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>((r) => setTimeout(() => r(null), 5000)),
      ]);
      return ready ?? (reg.active ? reg : null);
    })
    .catch(() => null);
  return registration;
}

/**
 * Shows one reminder notification. Does nothing without permission. The tag makes a second
 * attempt for the same slot and day replace the first instead of stacking.
 */
export async function showAdhkarNotification(opts: { title: string; body: string; url: string; tag: string }): Promise<boolean> {
  if (notificationPermission() !== 'granted') return false;
  const options: NotificationOptions = {
    body: opts.body,
    tag: opts.tag,
    icon: '/icon.svg',
    lang: 'ar',
    dir: 'rtl',
    data: { url: opts.url },
  };
  const reg = await adhkarServiceWorker();
  if (reg) {
    try {
      await reg.showNotification(opts.title, options);
      return true;
    } catch {
      // fall through to the page-level notification
    }
  }
  try {
    const n = new Notification(opts.title, options);
    n.onclick = () => {
      window.focus();
      window.location.assign(opts.url);
      n.close();
    };
    return true;
  } catch {
    return false; // e.g. Android Chrome only allows notifications through a service worker
  }
}
