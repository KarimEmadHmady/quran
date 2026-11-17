'use client';

import { useState } from 'react';
import { Alert, Button, ConfirmDialog, ErrorState, Spinner, useToast } from '@/components/admin/ui';
import { statusOf, useAdminData } from '@/components/admin/useAdminData';
import { Icon, type IconName } from '@/components/Icon';
import { adminErrorMessage } from '@/lib/admin';
import { adminApi, type AdminSurahReciter } from '@/lib/adminApi';

const fmt = (n: number) => n.toLocaleString('ar-EG');
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }) : 'لم تتم بعد';

/**
 * Full-sura reciters (one MP3 per sura). A separate catalogue from the verse-by-verse reciters,
 * built from the CDN's by-surah listing. Sync is quick (one listing + names), so it runs inline.
 */
export function SurahRecitersSection() {
  const toast = useToast();
  const { value, reload } = useAdminData((s) => adminApi.surahReciters(s), []);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');

  const sync = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await adminApi.syncSurahReciters();
      toast(
        'success',
        `تمت مزامنة ${fmt(r.total)} قارئ للسورة كاملة (${fmt(r.added)} جديد، ${fmt(r.markedUnavailable)} لم يعد متاحاً)`,
      );
      setConfirm(false);
      reload();
    } catch (err) {
      setError(adminErrorMessage(statusOf(err), 'save'));
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (r: AdminSurahReciter) => {
    setToggling(r.identifier);
    try {
      await adminApi.setSurahReciterActive(r.identifier, !r.isActive);
      toast('success', r.isActive ? 'تم إخفاء القارئ عن المستخدمين' : 'تم تفعيل القارئ');
      reload();
    } catch (err) {
      toast('error', adminErrorMessage(statusOf(err), 'save'));
    } finally {
      setToggling(null);
    }
  };

  const raw = filter.trim();
  const q = raw.toLowerCase();
  const matches = (r: AdminSurahReciter) =>
    !q || r.identifier.includes(q) || (r.name ?? '').includes(raw) || (r.englishName ?? '').toLowerCase().includes(q);

  return (
    <section className="space-y-3" data-testid="surah-reciters">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="ui-section-label">قرّاء السورة كاملة (ملف واحد لكل سورة)</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">قائمة منفصلة عن قرّاء «آية بآية»، مصدرها فهرس ملفات السور على الـ CDN.</p>
        </div>
        {value.state === 'ready' && value.data.schemaReady && (
          <Button variant="ghost" onClick={() => setConfirm(true)}>
            <Icon name="refresh" className="h-4 w-4" />
            مزامنة قرّاء السورة كاملة
          </Button>
        )}
      </div>

      {value.state === 'loading' && <Spinner />}
      {value.state === 'error' && <ErrorState message={value.message} onRetry={reload} />}
      {value.state === 'ready' && !value.data.schemaReady && (
        <Alert kind="error">
          جدول قرّاء السورة كاملة غير موجود بعد. شغّل <code dir="ltr">npm run db:migrate:audio</code>. التشغيل للمستخدمين يعمل
          مؤقتاً مباشرة من فهرس الـ CDN.
        </Alert>
      )}
      {value.state === 'ready' && value.data.schemaReady && (
        <>
          {value.data.total === 0 && (
            <Alert kind="info">لم تتم المزامنة بعد. إلى ذلك الحين يحصل المستخدمون على القائمة مباشرة من فهرس الـ CDN.</Alert>
          )}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat icon="headphones" label="القرّاء المتاحون" value={fmt(value.data.available)} sub={`${fmt(value.data.total)} إجمالاً`} />
            <Stat icon="check" label="المفعّلون" value={fmt(value.data.active)} />
            <Stat icon="book" label="لديهم الـ ١١٤ سورة" value={fmt(value.data.complete)} />
            <Stat icon="calendar" label="آخر مزامنة" value={when(value.data.lastSyncAt)} small />
          </div>
          {value.data.total > 0 && (
            <>
              <button type="button" className="ui-chip" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
                <Icon name="menu" className="h-4 w-4" />
                {open ? 'إخفاء القائمة' : `عرض القرّاء (${fmt(value.data.total)})`}
              </button>
              {open && (
                <>
                  <input
                    className="ui-input w-full px-3 py-2.5 text-sm"
                    placeholder="ابحث بالاسم أو المعرّف…"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    aria-label="بحث في قرّاء السورة كاملة"
                  />
                  <ul className="grid gap-2 lg:grid-cols-2">
                    {value.data.data.filter(matches).map((r) => (
                      <li key={r.identifier} className="ui-card flex items-center justify-between gap-3 p-3 text-sm">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{r.name ?? r.englishName ?? r.identifier}</p>
                          <p className="truncate text-xs text-[var(--muted)]" dir="ltr">
                            {r.identifier} · {r.bitrate} kbps · {r.surahCount}/114
                          </p>
                          {r.missingSurahs.length > 0 && (
                            <p className="truncate text-xs text-[var(--danger)]">
                              سور ناقصة: {r.missingSurahs.slice(0, 12).join('، ')}
                              {r.missingSurahs.length > 12 ? '…' : ''}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {!r.isAvailable && <span className="ui-badge bg-[var(--surface-2)] text-[var(--danger)]">لم يعد متاحاً</span>}
                          {r.isActive ? (
                            <span className="ui-badge ui-badge-blue">مفعّل</span>
                          ) : (
                            <span className="ui-badge bg-[var(--surface-2)] text-[var(--muted)]">مخفي</span>
                          )}
                          <Button
                            variant="ghost"
                            busy={toggling === r.identifier}
                            onClick={() => void toggle(r)}
                            className="!px-3 !py-1.5 text-xs"
                            disabled={!r.isAvailable && !r.isActive}
                          >
                            {r.isActive ? 'إخفاء' : 'تفعيل'}
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </>
      )}

      {confirm && (
        <ConfirmDialog
          title="مزامنة قرّاء السورة كاملة"
          message="يُقرأ فهرس ملفات السور من الـ CDN (أي قارئ، بأي جودة، وأي سور متوفرة) وأسماء القرّاء من AlQuran Cloud، ويُحفظ ذلك في جدول منفصل. لا يتأثر قرّاء «آية بآية» ولا نصوص القرآن."
          confirmLabel="ابدأ"
          busy={busy}
          error={error}
          onConfirm={() => void sync()}
          onCancel={() => {
            setConfirm(false);
            setError(null);
          }}
        />
      )}
    </section>
  );
}

function Stat({ icon, label, value, sub, small }: { icon: IconName; label: string; value: string; sub?: string; small?: boolean }) {
  return (
    <div className="ui-card flex flex-col gap-3 p-5">
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--badge-green-bg)] text-[var(--badge-green-fg)]">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <div>
        <p className="text-sm text-[var(--muted)]">{label}</p>
        <p className={`mt-1 font-bold tabular-nums tracking-tight ${small ? 'text-base' : 'text-3xl'}`}>{value}</p>
        {sub && <p className="mt-1 text-xs text-[var(--muted)]">{sub}</p>}
      </div>
    </div>
  );
}
