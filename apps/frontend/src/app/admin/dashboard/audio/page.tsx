'use client';

import { useEffect, useRef, useState } from 'react';
import { Alert, Button, ConfirmDialog, EmptyState, ErrorState, PageTitle, Spinner, useToast } from '@/components/admin/ui';
import { statusOf, useAdminData } from '@/components/admin/useAdminData';
import { Icon, type IconName } from '@/components/Icon';
import { adminErrorMessage } from '@/lib/admin';
import { adminApi, type AdminEdition, type AdminReciter, type AudioSyncJob } from '@/lib/adminApi';
import { SurahRecitersSection } from './SurahRecitersSection';

const fmt = (n: number) => n.toLocaleString('ar-EG');
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }) : 'لم تتم بعد';
const POLL_MS = 2000;

const JOB_STATUS: Record<AudioSyncJob['status'], string> = {
  running: 'قيد التشغيل',
  completed: 'اكتملت',
  failed: 'فشلت',
  interrupted: 'توقفت قبل الانتهاء',
};

type Action = 'reciters' | 'refresh' | 'audio' | 'resume';

const ACTIONS: Record<Action, { title: string; message: string; confirm: string }> = {
  reciters: {
    title: 'مزامنة القرّاء',
    message:
      'يُجلب قائمة القرّاء (تلاوات عربية آية بآية) من AlQuran Cloud، وتُحفظ بياناتهم، ويُتحقق من نمط روابط الصوت للقرّاء الجدد أو غير المؤكدين فقط. نصوص القرآن لا تتأثر.',
    confirm: 'ابدأ المزامنة',
  },
  refresh: {
    title: 'تحديث بيانات كل القرّاء',
    message: 'نفس المزامنة، لكن يُعاد التحقق من روابط الصوت لكل القرّاء (أبطأ قليلاً).',
    confirm: 'ابدأ التحديث',
  },
  audio: {
    title: 'مزامنة روابط التلاوة',
    message:
      'لكل قارئ مفعّل ومؤكد ولكل آية، يُحفظ رابط تسجيل ثبت وجوده على الـ CDN، وتُسجّل الآيات التي لا تسجيل لها كـ«مفقودة». العملية تعمل في الخلفية ويمكن استئنافها لو توقفت، ولا تُكرر أي سجل.',
    confirm: 'ابدأ المزامنة',
  },
  resume: {
    title: 'استئناف المزامنة المتوقفة',
    message: 'تكمل آخر مزامنة توقفت من حيث انتهت.',
    confirm: 'استئناف',
  },
};

export default function AudioAdminPage() {
  const toast = useToast();
  const { value, reload, setValue } = useAdminData((s) => adminApi.audioOverview(s), []);
  const [action, setAction] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [showEditions, setShowEditions] = useState(false);

  const running = value.state === 'ready' ? value.data.sync.running : null;
  const wasRunning = useRef(false);

  // Poll progress while a job runs; reload the whole overview when it finishes.
  useEffect(() => {
    if (!running) {
      if (wasRunning.current) {
        wasRunning.current = false;
        reload();
      }
      return;
    }
    wasRunning.current = true;
    const ctrl = new AbortController();
    const t = setInterval(() => {
      adminApi
        .audioSyncStatus(ctrl.signal)
        .then((sync) =>
          setValue((v) => (v.state === 'ready' ? { state: 'ready', data: { ...v.data, sync } } : v)),
        )
        .catch(() => undefined);
    }, POLL_MS);
    return () => {
      ctrl.abort();
      clearInterval(t);
    };
  }, [running, reload, setValue]);

  const start = async () => {
    if (!action) return;
    setBusy(true);
    setError(null);
    try {
      const job =
        action === 'reciters' || action === 'refresh'
          ? await adminApi.syncReciters(action === 'refresh')
          : await adminApi.syncAudio(action === 'resume' ? { resume: true } : {});
      toast('success', 'بدأت المزامنة في الخلفية');
      setAction(null);
      setValue((v) =>
        v.state === 'ready' ? { state: 'ready', data: { ...v.data, sync: { ...v.data.sync, running: job } } } : v,
      );
    } catch (err) {
      const status = statusOf(err);
      setError(status === 409 ? conflictMessage(action) : adminErrorMessage(status, 'save'));
    } finally {
      setBusy(false);
    }
  };

  const toggleReciter = async (r: AdminReciter) => {
    setToggling(r.identifier);
    try {
      await adminApi.setReciterActive(r.identifier, !r.isActive);
      toast('success', r.isActive ? `تم إخفاء ${r.name} عن المستخدمين` : `تم تفعيل ${r.name}`);
      reload();
    } catch (err) {
      toast('error', adminErrorMessage(statusOf(err), 'save'));
    } finally {
      setToggling(null);
    }
  };

  const lastAudio = value.state === 'ready' ? value.data.sync.lastAudioJob : null;
  const canResume = !running && !!lastAudio?.resumable;

  return (
    <>
      <PageTitle
        title="التلاوات الصوتية"
        subtitle="القرّاء وروابط التلاوة من AlQuran Cloud. نصوص القرآن لا تتغير."
        actions={
          value.state === 'ready' && value.data.schemaReady ? (
            <>
              <Button variant="ghost" onClick={() => setAction('reciters')} disabled={!!running}>
                <Icon name="refresh" className="h-4 w-4" />
                مزامنة القرّاء
              </Button>
              <Button variant="ghost" onClick={() => setAction('refresh')} disabled={!!running}>
                <Icon name="check" className="h-4 w-4" />
                تحديث بيانات القرّاء
              </Button>
              {canResume && (
                <Button variant="ghost" onClick={() => setAction('resume')}>
                  <Icon name="play" className="h-4 w-4" />
                  استئناف المزامنة
                </Button>
              )}
              <Button onClick={() => setAction('audio')} disabled={!!running || value.data.reciters.verified === 0}>
                <Icon name="headphones" className="h-4 w-4" />
                مزامنة روابط التلاوة
              </Button>
            </>
          ) : undefined
        }
      />

      {value.state === 'loading' && <Spinner />}
      {value.state === 'error' && <ErrorState message={value.message} onRetry={reload} />}
      {value.state === 'ready' && !value.data.schemaReady && (
        <Alert kind="error">
          جداول التلاوة غير موجودة في قاعدة البيانات بعد. شغّل <code dir="ltr">npm run db:migrate:audio</code> من جذر المشروع (إضافة
          جداول جديدة فقط)، ثم أعد تحميل الصفحة. التشغيل للمستخدمين يعمل مؤقتاً مباشرة من AlQuran Cloud.
        </Alert>
      )}
      {value.state === 'ready' && value.data.schemaReady && (
        <div className="space-y-6">
          {value.data.reciters.total === 0 && (
            <Alert kind="info">
              لم تتم مزامنة القرّاء بعد. ابدأ بـ«مزامنة القرّاء»، ثم «مزامنة روابط التلاوة». إلى ذلك الحين يحصل المستخدمون على
              القائمة والروابط مباشرة من AlQuran Cloud.
            </Alert>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="audio-stats">
            <Stat icon="user" label="القرّاء المتاحون" value={value.data.reciters.available} sub={`${fmt(value.data.reciters.total)} إجمالاً`} />
            <Stat
              icon="check"
              label="القرّاء المفعّلون"
              value={value.data.reciters.active}
              sub={`${fmt(value.data.reciters.verified)} روابطهم مؤكدة`}
            />
            <Stat icon="file" label="آيات القرآن" value={value.data.ayahs} sub="للقراءة فقط" />
            <Stat
              icon="headphones"
              label="روابط التلاوة المحفوظة"
              value={value.data.audio.available}
              sub={`${fmt(value.data.audio.missing)} مفقودة · المتوقع ${fmt(value.data.audio.expected)}`}
            />
          </div>

          <p className="text-sm text-[var(--muted)]">آخر مزامنة: {when(value.data.lastSyncAt)}</p>

          {running && <JobCard job={running} title="مزامنة جارية" />}
          {!running && lastAudio && <JobCard job={lastAudio} title="آخر مزامنة لروابط التلاوة" />}
          {!running && value.data.sync.lastReciterJob && (
            <JobCard job={value.data.sync.lastReciterJob} title="آخر مزامنة للقرّاء" />
          )}

          <section>
            <h2 className="ui-section-label mb-3">القرّاء</h2>
            {value.data.reciterList.length === 0 ? (
              <EmptyState title="لا يوجد قرّاء محفوظون" hint="ابدأ بمزامنة القرّاء." />
            ) : (
              <ul className="grid gap-3 lg:grid-cols-2" data-testid="reciter-list">
                {value.data.reciterList.map((r) => (
                  <ReciterRow key={r.identifier} r={r} busy={toggling === r.identifier} onToggle={() => void toggleReciter(r)} />
                ))}
              </ul>
            )}
          </section>

          <SurahRecitersSection />

          <section>
            <button type="button" className="ui-chip" onClick={() => setShowEditions((s) => !s)} aria-expanded={showEditions}>
              <Icon name="search" className="h-4 w-4" />
              {showEditions ? 'إخفاء' : 'عرض'} كل إصدارات الصوت في AlQuran Cloud
            </button>
            {showEditions && <EditionsList />}
          </section>
        </div>
      )}

      {action && (
        <ConfirmDialog
          title={ACTIONS[action].title}
          message={ACTIONS[action].message}
          confirmLabel={ACTIONS[action].confirm}
          busy={busy}
          error={error}
          onConfirm={() => void start()}
          onCancel={() => {
            setAction(null);
            setError(null);
          }}
        />
      )}
    </>
  );
}

function conflictMessage(action: Action): string {
  if (action === 'resume') return 'لا توجد مزامنة متوقفة لاستئنافها.';
  if (action === 'audio') return 'توجد مزامنة جارية، أو لا يوجد قرّاء مؤكدون بعد (زامن القرّاء أولاً).';
  return 'توجد مزامنة جارية بالفعل.';
}

function Stat({ icon, label, value, sub }: { icon: IconName; label: string; value: number; sub?: string }) {
  return (
    <div className="ui-card flex flex-col gap-3 p-5">
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--badge-blue-bg)] text-[var(--badge-blue-fg)]">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <div>
        <p className="text-sm text-[var(--muted)]">{label}</p>
        <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight">{fmt(value)}</p>
        {sub && <p className="mt-1 text-xs text-[var(--muted)]">{sub}</p>}
      </div>
    </div>
  );
}

function JobCard({ job, title }: { job: AudioSyncJob; title: string }) {
  const pct = job.itemsTotal > 0 ? Math.min(100, Math.round((job.itemsDone / job.itemsTotal) * 100)) : job.status === 'completed' ? 100 : 0;
  const tone =
    job.status === 'completed' ? 'ui-badge-green' : job.status === 'running' ? 'ui-badge-blue' : 'bg-[var(--surface-2)] text-[var(--danger)]';
  return (
    <section className="ui-card space-y-3 p-5" aria-live="polite" data-testid="sync-job">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        <span className={`ui-badge ${tone}`}>{JOB_STATUS[job.status]}</span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-[var(--surface-2)]"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label="تقدّم المزامنة"
      >
        <div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${pct}%` }} />
      </div>
      <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-[var(--muted)]">القرّاء</dt>
          <dd>
            {fmt(job.recitersDone)} / {fmt(job.recitersTotal)}
          </dd>
        </div>
        {job.kind === 'audio' && (
          <>
            <div>
              <dt className="text-[var(--muted)]">الآيات</dt>
              <dd>
                {fmt(job.itemsDone)} / {fmt(job.itemsTotal)}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">مفقودة</dt>
              <dd>{fmt(job.missingCount)}</dd>
            </div>
          </>
        )}
        <div>
          <dt className="text-[var(--muted)]">أخطاء</dt>
          <dd className={job.errorCount ? 'text-[var(--danger)]' : ''}>{fmt(job.errorCount)}</dd>
        </div>
      </dl>
      {job.currentReciter && (
        <p className="text-sm text-[var(--muted)]">
          القارئ الحالي: <span dir="ltr">{job.currentReciter}</span>
        </p>
      )}
      {job.summary && (
        <p className="text-sm text-[var(--muted)]">
          {fmt(job.summary.total)} قارئ · {fmt(job.summary.added)} جديد · {fmt(job.summary.verified)} مؤكد ·{' '}
          {fmt(job.summary.markedUnavailable)} لم يعد متاحاً
        </p>
      )}
      <p className="text-xs text-[var(--muted)]">
        بدأت {when(job.startedAt)}
        {job.finishedAt && ` · انتهت ${when(job.finishedAt)}`}
        {job.resumable && ' · يمكن استئنافها'}
      </p>
      {job.errors.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-[var(--danger)]">عرض الأخطاء ({fmt(job.errors.length)})</summary>
          <ul className="mt-2 max-h-60 space-y-1 overflow-y-auto">
            {[...job.errors].reverse().map((e, i) => (
              <li key={i} className="rounded-lg bg-[var(--surface-2)] px-3 py-2" dir="auto">
                {e.reciter && (
                  <span className="me-2 font-semibold" dir="ltr">
                    {e.reciter}
                  </span>
                )}
                {e.message}
                <span className="ms-2 text-xs text-[var(--muted)]">{when(e.at)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function ReciterRow({ r, busy, onToggle }: { r: AdminReciter; busy: boolean; onToggle: () => void }) {
  return (
    <li className="ui-card flex flex-col gap-3 p-4" data-testid="reciter-row">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">{r.name}</p>
          <p className="truncate text-xs text-[var(--muted)]" dir="ltr">
            {r.identifier}
            {r.englishName ? ` · ${r.englishName}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          {!r.isAvailable && <span className="ui-badge bg-[var(--surface-2)] text-[var(--danger)]">لم يعد متاحاً</span>}
          {r.verified ? (
            <span className="ui-badge ui-badge-green">مؤكد</span>
          ) : (
            <span className="ui-badge bg-[var(--surface-2)] text-[var(--danger)]">غير مؤكد</span>
          )}
          {r.isActive ? (
            <span className="ui-badge ui-badge-blue">مفعّل</span>
          ) : (
            <span className="ui-badge bg-[var(--surface-2)] text-[var(--muted)]">مخفي</span>
          )}
        </div>
      </div>
      {r.verificationError && <p className="text-xs text-[var(--danger)]">{r.verificationError}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--muted)]">
        <span>
          {r.bitrate ? `${r.bitrate} kbps` : '—'}
          {r.secondaryBitrates.length > 0 && ` (+${r.secondaryBitrates.join('، ')})`} · {fmt(r.audio.available)} رابط ·{' '}
          {fmt(r.audio.missing)} مفقود · آخر مزامنة {when(r.lastSyncedAt)}
        </span>
        <Button variant="ghost" busy={busy} onClick={onToggle} className="!px-3 !py-1.5 text-xs" disabled={!r.isAvailable && !r.isActive}>
          {r.isActive ? 'إخفاء عن المستخدمين' : 'تفعيل'}
        </Button>
      </div>
    </li>
  );
}

function EditionsList() {
  const { value, reload } = useAdminData((s) => adminApi.audioEditions(s), []);
  if (value.state === 'loading') return <Spinner />;
  if (value.state === 'error') return <ErrorState message={value.message} onRetry={reload} />;
  const list: AdminEdition[] = value.data.data;
  return (
    <div className="mt-3 overflow-x-auto rounded-2xl border border-[var(--border)]">
      <table className="w-full text-sm">
        <thead className="bg-[var(--surface-2)] text-[var(--muted)]">
          <tr>
            <th className="px-3 py-2 text-start">الإصدار</th>
            <th className="px-3 py-2 text-start">الاسم</th>
            <th className="px-3 py-2 text-start">اللغة</th>
            <th className="px-3 py-2 text-start">النوع</th>
            <th className="px-3 py-2 text-start">متوافق</th>
          </tr>
        </thead>
        <tbody>
          {list.map((e) => (
            <tr key={e.identifier} className="border-t border-[var(--border)]">
              <td className="px-3 py-2" dir="ltr">
                {e.identifier}
              </td>
              <td className="px-3 py-2">{e.name}</td>
              <td className="px-3 py-2">{e.language}</td>
              <td className="px-3 py-2" dir="ltr">
                {e.type}
              </td>
              <td className="px-3 py-2">
                {e.compatible ? (
                  <span className="ui-badge ui-badge-green">آية بآية</span>
                ) : (
                  <span className="ui-badge bg-[var(--surface-2)] text-[var(--muted)]">غير متوافق</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
