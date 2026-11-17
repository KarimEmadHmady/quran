'use client';

import Link from 'next/link';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  isFinished,
  isTodayDone,
  localDate,
  progress,
  scheduleDelta,
  shouldRemind,
  streak,
  todayPortion,
} from '@/lib/khatma';
import { Icon } from '@/components/Icon';
import { AyahIndex, ayahHref, type SuraInfo } from '@/lib/quran';
import { MAX_KHATMA_DAYS, TOTAL_AYAHS } from '@/lib/shapes';
import { useKhatmaStore } from '@/store/useKhatmaStore';

const PRESETS = [7, 15, 30, 60, 90];

export function KhatmaClient({ suras }: { suras: SuraInfo[] }) {
  const { khatma, hydrated, start, sync, reset } = useKhatmaStore();
  const index = useMemo(() => new AyahIndex(suras), [suras]);
  const [now, setNow] = useState(() => new Date());
  /** «حذف الختمة والبدء من جديد» confirmation dialog. */
  const [confirmReset, setConfirmReset] = useState(false);

  // The day can change while the page is open.
  useEffect(() => {
    const t = setInterval(() => {
      setNow(new Date());
      sync();
    }, 60_000);
    return () => clearInterval(t);
  }, [sync]);

  if (!hydrated) return <div className="h-40 animate-pulse rounded-2xl bg-[var(--border)]/60" aria-busy="true" />;
  if (!khatma) return <Setup onStart={start} />;

  const today = localDate(now);
  const label = (id: number) => {
    const r = index.refOf(id);
    return r ? `سورة ${r.sura.nameAr} · آية ${r.ayahNumber}` : `آية #${id}`;
  };
  const href = (id: number) => {
    const r = index.refOf(id);
    return r ? ayahHref(r.sura.number, id) : '/surah';
  };
  const pct = Math.round(progress(khatma) * 1000) / 10;
  const portion = todayPortion(khatma, today);
  const next = Math.min(TOTAL_AYAHS, khatma.lastAyahId + 1);
  const delta = scheduleDelta(khatma, today);
  const done = isTodayDone(khatma, today);
  const remainingToday = Math.max(0, portion.to - khatma.lastAyahId);

  return (
    <div className="space-y-4">
      {shouldRemind(khatma, now) && (
        <p role="status" className="ui-card !border-[var(--mark)] p-4 text-sm">
          لسه ما خلصتش ورد النهارده — فاضل {remainingToday} آية.
        </p>
      )}

      <section className="ui-card space-y-3 p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm text-[var(--muted)]">التقدم</h2>
          <span className="text-2xl font-bold">{pct}%</span>
        </div>
        <div
          className="h-2.5 overflow-hidden rounded-full bg-[var(--track)]"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label="نسبة الختمة"
        >
          <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-sm text-[var(--muted)]">
          {khatma.lastAyahId === 0 ? 'لسه ما بدأتش.' : `آخر آية قرأتها: ${label(khatma.lastAyahId)}`} · {khatma.lastAyahId} من{' '}
          {TOTAL_AYAHS} آية
        </p>
      </section>

      {isFinished(khatma) ? (
        <section className="rounded-2xl bg-[var(--badge-green-bg)] p-5 text-[var(--badge-green-fg)]">
          <h2 className="text-lg font-bold">ما شاء الله، ختمت القرآن! 🎉</h2>
          <p className="mt-1 text-sm">تقدر تبدأ ختمة جديدة من تحت.</p>
        </section>
      ) : (
        <section className="ui-hero space-y-2 p-5">
          <h2 className="text-sm text-[var(--hero-muted)]">ورد النهارده</h2>
          <p className="text-lg font-bold">
            من {label(portion.from)} لحد {label(portion.to)}
          </p>
          <p className="text-sm" data-testid="today-status">
            {done ? '✓ خلصت ورد النهارده' : `فاضل ${remainingToday} آية لهدف النهارده`}
          </p>
          <p className="text-sm text-[var(--hero-muted)]">
            {delta === 0 ? 'ماشي في الميعاد بالظبط.' : delta > 0 ? `متقدم ${delta} آية عن الخطة.` : `متأخر ${-delta} آية عن الخطة.`}
          </p>
          <Link href={href(next)} className="ui-btn-primary !mt-4 block w-full py-3 text-center">
            {khatma.lastAyahId === 0 ? 'ابدأ القراءة' : 'كمّل القراءة'}
          </Link>
          <p className="text-xs text-[var(--hero-muted)]">
            الآيات اللي بتعدّيها وإنت بتنزل في الصفحة بتتعلّم «✓ مقروءة» لوحدها. وتقدر كمان تدوس «تمت القراءة» على أي آية.
          </p>
        </section>
      )}

      <section className="grid grid-cols-3 gap-2 text-center text-sm">
        <Stat label="المدة" value={`${khatma.durationDays} يوم`} />
        <Stat label="الهدف اليومي" value={`${khatma.dailyTargetAyahs} آية`} />
        <Stat label="أيام متتالية" value={String(streak(khatma, today))} />
      </section>
      <p className="text-sm text-[var(--muted)]">
        بدأت يوم {khatma.startDate} · أيام مكتملة: {khatma.completedDates.length}
      </p>

      <button type="button" onClick={() => setConfirmReset(true)} className="text-sm text-[var(--danger)] underline">
        حذف الختمة والبدء من جديد
      </button>

      {confirmReset && (
        <ResetKhatmaDialog
          readAyahs={khatma.lastAyahId}
          completedDays={khatma.completedDates.length}
          onCancel={() => setConfirmReset(false)}
          onConfirm={() => {
            setConfirmReset(false);
            reset(); // the existing reset (removes quran_khatma); the setup form appears next
          }}
        />
      )}
    </div>
  );
}

/**
 * Confirmation before deleting the khatma (replaces window.confirm). Nothing is deleted unless
 * «حذف والبدء من جديد» is pressed; «إلغاء», the X, a click outside and Escape all just close it.
 * Focus starts on «إلغاء» so an accidental Enter never deletes.
 */
function ResetKhatmaDialog({
  readAyahs,
  completedDays,
  onCancel,
  onConfirm,
}: {
  readAyahs: number;
  completedDays: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const descId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Safe default: focus «إلغاء» once, when the dialog opens.
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-6"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
    >
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} aria-hidden />
      <div className="relative w-full max-w-sm rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-2xl">
        <button
          type="button"
          onClick={onCancel}
          aria-label="إغلاق"
          className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)]"
        >
          <Icon name="close" className="h-5 w-5" />
        </button>

        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--danger)]/15 text-[var(--danger)]" aria-hidden>
          <Icon name="trash" className="h-6 w-6" />
        </span>
        <h2 id={titleId} className="text-lg font-bold">
          حذف الختمة الحالية؟
        </h2>
        <div id={descId} className="mt-2 space-y-2 text-sm leading-7 text-[var(--muted)]">
          <p>
            هيتم حذف تقدّمك الحالي نهائياً
            {readAyahs > 0 && (
              <>
                {' '}
                (<strong className="text-[var(--fg)]">{readAyahs}</strong> من {TOTAL_AYAHS} آية مقروءة
                {completedDays > 0 ? `، ${completedDays} يوم مكتمل` : ''})
              </>
            )}
            ، وتبدأ ختمة جديدة من أول القرآن.
          </p>
          <p className="font-semibold text-[var(--danger)]">لا يمكن التراجع عن هذه الخطوة.</p>
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2.5 text-sm font-semibold hover:border-[var(--accent)]"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--danger)] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
          >
            <Icon name="trash" className="h-4 w-4" />
            حذف والبدء من جديد
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="ui-card p-3">
      <div className="text-[var(--muted)]">{label}</div>
      <div className="font-bold">{value}</div>
    </div>
  );
}

function Setup({ onStart }: { onStart: (days: number) => void }) {
  const [days, setDays] = useState(30);
  const valid = Number.isInteger(days) && days >= 1 && days <= MAX_KHATMA_DAYS;
  return (
    <form
      className="ui-card space-y-4 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onStart(days);
      }}
    >
      <h2 className="font-bold">ابدأ ختمة جديدة</h2>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDays(d)}
            aria-pressed={days === d}
            className={`ui-chip ${days === d ? '!border-[var(--accent)] !bg-[var(--accent)] !text-white' : ''}`}
          >
            {d} يوم
          </button>
        ))}
      </div>
      <label className="block text-sm">
        أو مدة مخصصة (من 1 لـ {MAX_KHATMA_DAYS} يوم):
        <input
          type="number"
          min={1}
          max={MAX_KHATMA_DAYS}
          value={Number.isFinite(days) ? days : ''}
          onChange={(e) => setDays(Number.parseInt(e.target.value, 10))}
          className="ui-input ms-2 !w-24 px-2 py-1"
          aria-label="مدة الختمة بالأيام"
        />
      </label>
      <p className="text-sm text-[var(--muted)]">
        {valid ? `الهدف: ${Math.ceil(TOTAL_AYAHS / days)} آية في اليوم.` : 'اختار مدة صحيحة.'}
      </p>
      <button type="submit" disabled={!valid} className="ui-btn-primary w-full py-3">
        ابدأ الختمة
      </button>
    </form>
  );
}
