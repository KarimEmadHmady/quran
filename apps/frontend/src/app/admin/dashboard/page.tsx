'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useAdmin } from '@/components/admin/AdminShell';
import { Button, ConfirmDialog, ErrorState, Spinner, useToast } from '@/components/admin/ui';
import { statusOf, useAdminData } from '@/components/admin/useAdminData';
import { Icon, type IconName } from '@/components/Icon';
import { adminErrorMessage } from '@/lib/admin';
import { adminApi } from '@/lib/adminApi';

const fmt = (n: number) => n.toLocaleString('ar-EG');

export default function DashboardOverview() {
  const admin = useAdmin();
  const toast = useToast();
  const { value, reload } = useAdminData((s) => adminApi.stats(s), []);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reindex = async () => {
    setBusy(true);
    setError(null);
    try {
      await adminApi.reindex();
      toast('success', 'تمت إعادة بناء فهرس البحث');
      setConfirm(false);
    } catch (err) {
      setError(adminErrorMessage(statusOf(err), 'save'));
    } finally {
      setBusy(false);
    }
  };

  const today = new Date().toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="mx-auto max-w-5xl">
      <section className="ui-hero mb-5 flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <div>
          <h1 className="text-lg font-bold sm:text-xl">{`أهلاً ${admin.name ?? ''}`.trim()}</h1>
          <p className="text-xs text-[var(--hero-muted)]">{today}</p>
        </div>
 
      </section>

      {value.state === 'loading' && <Spinner />}
      {value.state === 'error' && <ErrorState message={value.message} onRetry={reload} />}
      {value.state === 'ready' && (
        <>
          <h2 className="ui-section-label mb-3">المحتوى القابل للتعديل</h2>
          <div className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="stats">
            <Stat
              icon="folder"
              label="المواضيع"
              value={value.data.topics.total}
              chips={[`${fmt(value.data.topics.banned)} محظور`, `${fmt(value.data.topics.hidden)} مخفي`]}
              href="/admin/dashboard/topics"
            />
            <Stat icon="link" label="روابط الآيات بالمواضيع" value={value.data.topicLinks} href="/admin/dashboard/topics" />
            <Stat icon="book" label="السور" value={value.data.suras} href="/admin/dashboard/suras" />
            <Stat
              icon="tafsir"
              label="كتب التفسير"
              value={value.data.tafsirBooks.total}
              chips={[`${fmt(value.data.tafsirBooks.visible)} ظاهر للمستخدمين`]}
              href="/admin/dashboard/tafsir-books"
            />
          </div>

          <h2 className="ui-section-label mb-3">للقراءة فقط</h2>
          <div className="ui-card mb-10 divide-y divide-[var(--border)] overflow-hidden">
            <ReadRow icon="file" label="الآيات" value={value.data.ayahs} href="/admin/dashboard/ayahs" />
            <ReadRow icon="search" label="نصوص التفسير" value={value.data.tafsirs} href="/admin/dashboard/tafsirs" />
          </div>
        </>
      )}

      <h2 className="ui-section-label mb-3">فهرس البحث</h2>
      <section className="ui-card flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="max-w-xl">
          <h3 className="font-bold">ما هو فهرس البحث؟</h3>
          <p className="mt-2 text-sm leading-7 text-[var(--muted)]">
            نسخة منظّمة من نصوص الآيات وأسماء السور يحتفظ بها الخادم في الذاكرة، ليجد البحث الآيات بسرعة ويصحّح الأخطاء
            الإملائية ويفهم المراجع مثل «البقرة 255».
          </p>
          <p className="mt-2 text-sm leading-7 text-[var(--muted)]">
            أعد بناءه بعد أي تعديل حديث (مثل اسم سورة) ليظهر في البحث. البحث يظل يعمل أثناء البناء.
          </p>
        </div>
        <Button variant="ghost" onClick={() => setConfirm(true)} className="shrink-0 !text-[var(--fg)]">
          <Icon name="search" className="h-4 w-4" />
          إعادة بناء فهرس البحث
        </Button>
      </section>

      {confirm && (
        <ConfirmDialog
          title="إعادة بناء فهرس البحث"
          message="يُعاد تحميل الآيات وأسماء السور من قاعدة البيانات إلى محرك البحث. البحث يظل شغالاً بالفهرس الحالي أثناء البناء."
          confirmLabel="ابدأ"
          busy={busy}
          error={error}
          onConfirm={reindex}
          onCancel={() => {
            setConfirm(false);
            setError(null);
          }}
        />
      )}
    </div>
  );
}

/** Editable content: a card with a big number, linking to its management page. */
function Stat({
  icon,
  label,
  value,
  chips = [],
  href,
}: {
  icon: IconName;
  label: string;
  value: number;
  chips?: string[];
  href: string;
}) {
  return (
    <Link
      href={href}
      className="ui-card group flex flex-col gap-3 p-5 transition hover:border-[var(--accent)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
    >
      <div className="flex items-center justify-between">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--badge-blue-bg)] text-[var(--badge-blue-fg)]">
          <Icon name={icon} className="h-5 w-5" />
        </span>
        <Icon name="chevron" className="h-4 w-4 text-[var(--muted)] transition group-hover:text-[var(--accent)]" />
      </div>
      <div>
        <p className="text-4xl font-bold tabular-nums tracking-tight">{fmt(value)}</p>
        <p className="mt-1 text-sm text-[var(--muted)]">{label}</p>
      </div>
      {chips.length > 0 && (
        <div className="mt-auto flex flex-wrap gap-2 border-t border-[var(--border)] pt-3">
          {chips.map((c) => (
            <span key={c} className="ui-badge bg-[var(--surface-2)] text-[var(--muted)]">
              {c}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}

/** Read-only content: a compact row, so it reads as secondary to the editable cards. */
function ReadRow({ icon, label, value, href }: { icon: IconName; label: string; value: number; href: string }) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 px-5 py-4 transition hover:bg-[var(--surface-2)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--badge-green-bg)] text-[var(--badge-green-fg)]">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <span className="flex-1 font-medium">{label}</span>
      <span className="ui-badge bg-[var(--surface-2)] text-[var(--muted)]">للقراءة فقط</span>
      <span className="min-w-16 text-left text-xl font-bold tabular-nums">{fmt(value)}</span>
      <Icon name="chevron" className="h-4 w-4 text-[var(--muted)] transition group-hover:text-[var(--accent)]" />
    </Link>
  );
}