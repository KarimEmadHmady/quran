'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import { effectivePref, formatTime, isTime } from '@/lib/adhkar';
import type { ReminderDefinition } from '@/lib/adhkarApi';
import {
  adhkarServiceWorker,
  notificationPermission,
  requestNotificationPermission,
  showAdhkarNotification,
  type NotifyPermission,
} from '@/lib/adhkarNotify';
import { useAdhkarStore } from '@/store/useAdhkarStore';

const PERMISSION_TEXT: Record<NotifyPermission, string> = {
  granted: 'الإشعارات مسموحة.',
  default: 'هنطلب إذن الإشعارات أول ما تفعّل تذكير.',
  denied: 'الإشعارات مرفوضة من المتصفح. فعّلها من إعدادات الموقع في المتصفح عشان يوصلك التذكير.',
  unsupported: 'المتصفح ده مش بيدعم الإشعارات. التذكير هيظهر جوه صفحة الأذكار بس.',
};

/** The per-slot switch + time, the permission state, a test button and the honest limits. */
export function RemindersClient({ reminders }: { reminders: ReminderDefinition[] }) {
  const hydrated = useAdhkarStore((s) => s.hydrated);
  const prefs = useAdhkarStore((s) => s.reminders);
  const setReminder = useAdhkarStore((s) => s.setReminder);
  const [permission, setPermission] = useState<NotifyPermission>('default');
  const [testMsg, setTestMsg] = useState('');

  useEffect(() => setPermission(notificationPermission()), []);

  const enable = async (r: ReminderDefinition, enabled: boolean) => {
    const current = effectivePref(r, prefs);
    setReminder(r.key, { ...current, enabled });
    if (!enabled) return;
    // Asked only from this click, and only once (the browser remembers the answer).
    const p = await requestNotificationPermission();
    setPermission(p);
    if (p === 'granted') void adhkarServiceWorker();
  };

  const test = async () => {
    const r = reminders[0];
    const ok = await showAdhkarNotification({
      title: r.label,
      body: `${r.message} — ${r.categoryTitle}`,
      url: `/adhkar/${r.categoryId}`,
      tag: 'adhkar-test',
    });
    setTestMsg(ok ? 'اتبعت إشعار تجريبي.' : 'مقدرناش نبعت الإشعار. اتأكد إن الإشعارات مسموحة.');
  };

  if (!hydrated) return <p className="text-[var(--muted)]" role="status">جاري التحميل…</p>;

  return (
    <div className="space-y-4">
      <div className="ui-card space-y-2 p-4 text-sm" role="status">
        <p className="flex items-center gap-2 font-semibold">
          <Icon name="bell" className="h-5 w-5 text-[var(--accent)]" />
          {PERMISSION_TEXT[permission]}
        </p>
        {permission === 'granted' && (
          <button type="button" onClick={test} className="ui-chip">
            جرّب إشعار
          </button>
        )}
        {testMsg && <p className="text-[var(--muted)]">{testMsg}</p>}
      </div>

      <ul className="ui-card divide-y divide-[var(--border)] overflow-hidden">
        {reminders.map((r) => {
          const p = effectivePref(r, prefs);
          const timeId = `reminder-time-${r.key}`;
          return (
            <li key={r.key} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{r.label}</span>
                <Link href={`/adhkar/${r.categoryId}`} className="text-xs text-[var(--accent)] hover:underline">
                  {r.categoryTitle}
                </Link>
              </span>
              <label htmlFor={timeId} className="sr-only">
                وقت {r.label}
              </label>
              <input
                id={timeId}
                type="time"
                value={p.time}
                onChange={(e) => isTime(e.target.value) && setReminder(r.key, { ...p, time: e.target.value })}
                className="ui-input w-auto px-3 py-1.5 text-sm"
                dir="ltr"
              />
              <button
                type="button"
                role="switch"
                aria-checked={p.enabled}
                aria-label={`تذكير ${r.label} (${formatTime(p.time)})`}
                onClick={() => void enable(r, !p.enabled)}
                className={`relative h-7 w-12 shrink-0 rounded-full transition ${
                  p.enabled ? 'bg-[var(--accent)]' : 'bg-[var(--track)]'
                }`}
              >
                <span
                  className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${p.enabled ? 'right-6' : 'right-1'}`}
                />
              </button>
            </li>
          );
        })}
      </ul>

      <div className="ui-card space-y-1 p-4 text-sm text-[var(--muted)]">
        <p className="font-semibold text-[var(--fg)]">إزاي التذكير بيشتغل؟</p>
        <p>• التذكير بيوصل كإشعار طول ما التطبيق مفتوح في أي تبويب (حتى لو التبويب في الخلفية).</p>
        <p>
          • لو التطبيق كان مقفول وقت التذكير، الإشعار بيظهر مرة واحدة أول ما تفتحه خلال ساعتين من الوقت، وكمان
          بيظهر تنبيه في صفحة الأذكار.
        </p>
        <p>• التطبيق مش بيقدر يبعت إشعار وهو مقفول تمامًا (ده محتاج خادم إشعارات Push مش موجود حاليًا).</p>
        <p>• كل تذكير بيظهر مرة واحدة بس في اليوم. الإعدادات محفوظة على الجهاز ده بس.</p>
      </div>
    </div>
  );
}
