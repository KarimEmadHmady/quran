'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
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
    <>
      <section className="ui-hero mb-6 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <p className="text-sm text-[var(--hero-muted)]">{today}</p>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">{`أهلاً ${admin.name ?? ''}`.trim()}</h1>
          <p className="mt-1 text-sm opacity-80">ملخص محتوى التطبيق</p>
        </div>
        <ReindexButton onClick={() => setConfirm(true)} />
      </section>

      {value.state === 'loading' && <Spinner />}
      {value.state === 'error' && <ErrorState message={value.message} onRetry={reload} />}
      {value.state === 'ready' && (
        <>
          <h2 className="ui-section-label mb-3">المحتوى القابل للتعديل</h2>
          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="stats">
            <Stat
              icon="folder"
              tone="blue"
              label="المواضيع"
              value={value.data.topics.total}
              chips={[`${fmt(value.data.topics.banned)} محظور`, `${fmt(value.data.topics.hidden)} مخفي`]}
              href="/admin/dashboard/topics"
            />
            <Stat icon="link" tone="blue" label="روابط الآيات بالمواضيع" value={value.data.topicLinks} href="/admin/dashboard/topics" />
            <Stat icon="book" tone="blue" label="السور" value={value.data.suras} href="/admin/dashboard/suras" />
            <Stat
              icon="tafsir"
              tone="blue"
              label="كتب التفسير"
              value={value.data.tafsirBooks.total}
              chips={[`${fmt(value.data.tafsirBooks.visible)} ظاهر للمستخدمين`]}
              href="/admin/dashboard/tafsir-books"
            />
          </div>

          <h2 className="ui-section-label mb-3">للقراءة فقط</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Stat icon="file" tone="green" label="الآيات" value={value.data.ayahs} chips={['للقراءة فقط']} href="/admin/dashboard/ayahs" />
            <Stat icon="search" tone="green" label="نصوص التفسير" value={value.data.tafsirs} chips={['للقراءة فقط']} href="/admin/dashboard/tafsirs" />
          </div>
        </>
      )}

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
    </>
  );
}

/** The button plus a hover / focus explanation (pointer-events off, so clicks are never blocked). */
function ReindexButton({ onClick }: { onClick: () => void }) {
  const tipId = useId();
  return (
    <div className="group relative w-fit">
      <Button variant="ghost" onClick={onClick} aria-describedby={tipId} className="!text-[var(--fg)]">
        <Icon name="search" className="h-4 w-4" />
        إعادة بناء فهرس البحث
      </Button>
      <div
        id={tipId}
        role="tooltip"
        className="pointer-events-none invisible absolute right-0 top-full sm:left-0 sm:right-auto z-30 mt-2 w-72 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm leading-7 text-[var(--fg)] opacity-0 shadow-xl transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
      >
        <p className="mb-1 font-bold">ما هو فهرس البحث؟</p>
        <p className="text-[var(--muted)]">
          نسخة منظّمة من نصوص الآيات وأسماء السور يحتفظ بها الخادم في الذاكرة، ليجد البحث الآيات بسرعة ويصحّح الأخطاء
          الإملائية ويفهم المراجع مثل «البقرة 255».
        </p>
        <p className="mt-2 text-[var(--muted)]">
          إعادة البناء تقرأ المحتوى من قاعدة البيانات من جديد، فتظهر في البحث أي تغييرات حديثة (مثل تعديل اسم سورة). البحث
          يظل يعمل أثناء ذلك.
        </p>
      </div>
    </div>
  );
}

function Stat({
  icon,
  tone,
  label,
  value,
  chips = [],
  href,
}: {
  icon: IconName;
  tone: 'blue' | 'green';
  label: string;
  value: number;
  chips?: string[];
  href: string;
}) {
  const toneClass =
    tone === 'green'
      ? 'bg-[var(--badge-green-bg)] text-[var(--badge-green-fg)]'
      : 'bg-[var(--badge-blue-bg)] text-[var(--badge-blue-fg)]';
  return (
    <Link
      href={href}
      className="ui-card group flex flex-col gap-4 p-5 transition hover:-translate-y-0.5 hover:border-[var(--accent)] hover:shadow-lg"
    >
      <div className="flex items-start justify-between gap-3">
        <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${toneClass}`}>
          <Icon name={icon} className="h-6 w-6" />
        </span>
        <Icon name="chevron" className="h-5 w-5 text-[var(--muted)] transition group-hover:text-[var(--accent)]" />
      </div>
      <div>
        <p className="text-sm text-[var(--muted)]">{label}</p>
        <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight">{fmt(value)}</p>
      </div>
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2">
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
