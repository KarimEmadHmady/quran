'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { isAdminPath } from '@/components/AppChrome';
import { dueReminders, localDate, parseRemindersFired, reminderHref } from '@/lib/adhkar';
import { adhkarApi, type ReminderDefinition } from '@/lib/adhkarApi';
import { adhkarServiceWorker, notificationPermission, showAdhkarNotification } from '@/lib/adhkarNotify';
import { STORAGE_KEYS, getItem, setItem } from '@/lib/localStore';
import { useAdhkarStore } from '@/store/useAdhkarStore';

const CHECK_EVERY_MS = 30_000;
const LOCK_NAME = 'quran-adhkar-reminders';

/** Runs `fn` under a cross-tab lock when the browser has one (Web Locks), else directly. */
async function withLock(fn: () => Promise<void>): Promise<void> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (locks?.request) await locks.request(LOCK_NAME, fn);
  else await fn();
}

/**
 * Global, invisible: fires the adhkar reminders the user enabled, while the app is open.
 * - Checks every 30 s and whenever the tab becomes visible.
 * - Each slot fires at most once per day for ALL tabs: the "fired" date is re-read and written
 *   under a cross-tab lock BEFORE notifying, and the notification tag is per slot and day.
 * - Notifies only with permission granted; otherwise nothing is sent (the adhkar page still
 *   shows the due reminder as a banner).
 * - Does nothing on the admin dashboard, and makes no request at all until a reminder is enabled.
 */
export function AdhkarReminderScheduler() {
  const pathname = usePathname();
  const router = useRouter();
  const hydrated = useAdhkarStore((s) => s.hydrated);
  const prefs = useAdhkarStore((s) => s.reminders);
  const defs = useRef<ReminderDefinition[] | null>(null);
  const anyEnabled = Object.values(prefs).some((p) => p?.enabled);
  const admin = isAdminPath(pathname);

  // A click on a notification of an uncontrolled tab arrives as a message (adhkar-sw.js).
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      const d = e.data as { type?: string; url?: string } | null;
      if (d?.type === 'adhkar-navigate' && typeof d.url === 'string' && /^\/adhkar(\/[0-9]{1,5})?$/.test(d.url)) {
        router.push(d.url);
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [router]);

  useEffect(() => {
    if (!hydrated || !anyEnabled || admin) return;
    let cancelled = false;
    if (notificationPermission() === 'granted') void adhkarServiceWorker();

    const check = async () => {
      if (cancelled) return;
      try {
        defs.current ??= await adhkarApi.reminders();
      } catch {
        return; // API down: try again on the next tick
      }
      const current = useAdhkarStore.getState().reminders;
      if (dueReminders(defs.current, current, {}).length === 0) return;
      if (notificationPermission() !== 'granted') return;

      await withLock(async () => {
        const now = new Date();
        const fired = parseRemindersFired(getItem<unknown>(STORAGE_KEYS.adhkarRemindersFired, null));
        const due = dueReminders(defs.current!, current, fired, now);
        if (due.length === 0) return;
        const today = localDate(now);
        const next = { ...fired };
        for (const d of due) next[d.key] = today;
        setItem(STORAGE_KEYS.adhkarRemindersFired, next); // mark first: never twice
        for (const d of due) {
          void showAdhkarNotification({
            title: d.label,
            body: `${d.message} — ${d.categoryTitle}`,
            url: reminderHref(d),
            tag: `adhkar-${d.key}-${today}`,
          });
        }
      });
    };

    void check();
    const timer = setInterval(() => void check(), CHECK_EVERY_MS);
    const onVisible = () => document.visibilityState === 'visible' && void check();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [hydrated, anyEnabled, admin]);

  return null;
}
