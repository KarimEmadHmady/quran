'use client';

import Link from 'next/link';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  dayIndex,
  isFinished,
  isTodayDone,
  localDate,
  progress,
  scheduleDelta,
  shiftDate,
  shouldRemind,
  streak,
  todayPortion,
} from '@/lib/khatma';
import { HomeDate } from '@/components/HomeCards';
import { Icon } from '@/components/Icon';
import { AyahIndex, ayahHref, type SuraInfo } from '@/lib/quran';
import { MAX_KHATMA_DAYS, TOTAL_AYAHS } from '@/lib/shapes';
import { useKhatmaStore } from '@/store/useKhatmaStore';

const PRESETS = [7, 15, 30, 60, 90];
const WEEKDAY = new Intl.DateTimeFormat('ar-EG', { weekday: 'long' });

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
  if (!khatma)
    return (
      <div className="space-y-5">
        <header>
          <HomeDate />
          <h1 className="mt-1 text-xl font-bold text-[var(--accent)]">الختمة والورد اليومي</h1>
        </header>
        <Setup onStart={start} />
      </div>
    );

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

  // Same sura: "من الآية X إلى الآية Y"; otherwise the full references.
  const fromRef = index.refOf(portion.from);
  const toRef = index.refOf(portion.to);
  const sameSura = fromRef && toRef && fromRef.sura.number === toRef.sura.number;
  const daysLeft = Math.max(0, khatma.durationDays - dayIndex(khatma, today));
  // Last 7 days (oldest first, today last) against completedDates.
  const days7 = Array.from({ length: 7 }, (_, i) => shiftDate(today, i - 6));
  const doneSet = new Set(khatma.completedDates);
  const done7 = days7.filter((d) => doneSet.has(d)).length;
  const run = streak(khatma, today);

  return (
    <div className="space-y-5">
      {/* Title row (design): date + title, streak chip. */}
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <HomeDate />
          <h1 className="mt-1 text-xl font-bold text-[var(--accent)]">الختمة والورد اليومي</h1>
        </div>
        <span className="mt-3 inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--surface-2)] px-3 py-1.5 text-xs font-semibold">
          <span aria-hidden>🔥</span>
          {run} أيام متتالية
        </span>
      </header>

      {shouldRemind(khatma, now) && (
        <p role="status" className="rounded-2xl bg-[var(--tile-sand)] p-4 text-sm text-[var(--gold)]">
          لسه ما خلصتش ورد النهارده — فاضل {remainingToday} آية.
        </p>
      )}

      {isFinished(khatma) ? (
        <section className="rounded-[1.5rem] bg-[var(--badge-green-bg)] p-5 text-[var(--badge-green-fg)]">
          <h2 className="text-lg font-bold">ما شاء الله، ختمت القرآن! 🎉</h2>
          <p className="mt-1 text-sm">تقدر تبدأ ختمة جديدة من تحت.</p>
        </section>
      ) : (
        <section className="relative overflow-hidden rounded-[1.5rem] bg-[var(--hero)] p-5 text-[var(--hero-fg)] shadow-[var(--shadow-card)]">
          {/* eslint-disable-next-line @next/next/no-img-element -- decorative static image */}
          {/* Geometric pattern in the top-left corner, behind «الهدف» (design). */}
          <img
            src="/geometry-bg.png"
            alt=""
            aria-hidden
            width={144}
            height={144}
            className="pointer-events-none absolute left-0 top-0 w-44 select-none opacity-70"
          />
          <div className="relative space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs">
                <Icon name="book" className="h-3.5 w-3.5" />
                ورد النهارده
              </h2>
              <span className="text-xs text-[var(--hero-muted)]">الهدف: {khatma.dailyTargetAyahs} آية</span>
            </div>
            {sameSura ? (
              <>
                <p className="text-3xl font-bold">سورة {fromRef.sura.nameAr}</p>
                <p className="text-lg text-[var(--hero-muted)]">
                  من الآية {fromRef.ayahNumber} إلى الآية {toRef.ayahNumber}
                </p>
              </>
            ) : (
              <p className="text-xl font-bold leading-relaxed">
                من {label(portion.from)}
                <br />
                <span className="text-[var(--hero-muted)]">لحد {label(portion.to)}</span>
              </p>
            )}
            <div className="space-y-1 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm">
              <p data-testid="today-status">{done ? '✓ خلصت ورد النهارده' : `فاضل ${remainingToday} آية لهدف النهارده`}</p>
              <p className="text-white/70">
                {delta === 0 ? 'ماشي في الميعاد بالظبط.' : delta > 0 ? `متقدم ${delta} آية عن الخطة.` : `متأخر ${-delta} آية عن الخطة.`}
              </p>
            </div>
            <Link
              href={href(next)}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-[var(--brand-gold)] py-3.5 text-center font-bold text-[#3b2d0a] transition hover:brightness-105"
            >
              <Icon name="book" className="h-5 w-5" />
              {khatma.lastAyahId === 0 ? 'ابدأ القراءة' : 'كمّل القراءة'}
            </Link>
            <p className="text-xs text-white/60">
              الآيات اللي بتعدّيها وإنت بتنزل في الصفحة بتتعلّم «✓ مقروءة» لوحدها. وتقدر كمان تدوس «تمت القراءة» على أي آية.
            </p>
          </div>
        </section>
      )}

      {/* Overall progress (design: khatma card). */}
      <section className="ui-elevated space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--tile-mint)] text-[var(--accent)]">
              <Icon name="chart" className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-bold">التقدم</h2>
              <p className="text-xs text-[var(--muted)]">الهدف: ختمة كاملة في {khatma.durationDays} يوم</p>
            </div>
          </div>
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
          <div className="h-full rounded-full bg-gradient-to-l from-[var(--accent)] to-[var(--gold)]" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex justify-between text-xs text-[var(--muted)]">
          <span>{khatma.lastAyahId} آية مقروءة</span>
          <span>{TOTAL_AYAHS - khatma.lastAyahId} آية متبقية</span>
        </div>
        <p className="text-sm text-[var(--muted)]">
          {khatma.lastAyahId === 0 ? 'لسه ما بدأتش.' : `آخر آية قرأتها: ${label(khatma.lastAyahId)}`} · {khatma.lastAyahId} من{' '}
          {TOTAL_AYAHS} آية
        </p>
        {!isFinished(khatma) && (
          <p className="flex items-center gap-2 rounded-xl bg-[var(--surface-2)] px-4 py-3 text-sm">
            <Icon name="calendar" className="h-5 w-5 shrink-0 text-[var(--accent)]" />
            باقي {daysLeft} يوم على إتمام الختمة بمعدل {khatma.dailyTargetAyahs} آية يومياً
          </p>
        )}
      </section>

      {/* Last 7 days (design: commitment log), from completedDates. */}
      <section className="ui-elevated p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">سجل الالتزام بالأوراد</h2>
            <p className="text-xs text-[var(--muted)]">إنجاز الورد خلال آخر 7 أيام</p>
          </div>
          <span className="ui-badge ui-badge-blue">{done7} من 7</span>
        </div>
        <ol className="grid grid-cols-7 gap-1 text-center">
          {days7.map((d) => {
            const isToday = d === today;
            const ok = doneSet.has(d);
            return (
              <li key={d} className="flex flex-col items-center gap-2">
                <span className={`text-[0.7rem] font-semibold ${isToday ? 'text-[var(--accent)]' : 'text-[var(--muted)]'}`}>
                  {isToday ? 'اليوم' : WEEKDAY.format(new Date(`${d}T12:00:00`))}
                </span>
                <span
                  aria-label={ok ? 'مكتمل' : 'غير مكتمل'}
                  className={`flex h-9 w-9 items-center justify-center rounded-full sm:h-10 sm:w-10 ${
                    ok
                      ? 'bg-[var(--primary-bg)] text-[var(--primary-fg)]'
                      : isToday
                        ? 'border-2 border-dashed border-[var(--gold)] text-[var(--gold)]'
                        : 'bg-[var(--surface-2)] text-[var(--muted)]'
                  }`}
                >
                  {ok ? <Icon name="check" className="h-4 w-4" /> : isToday ? '…' : ''}
                </span>
              </li>
            );
          })}
        </ol>
        {!done && !isFinished(khatma) && (
          <p className="mt-4 text-center text-sm text-[var(--muted)]">أكمل ورد اليوم للمحافظة على سلسلة قراءتك!</p>
        )}
      </section>

      <section className="grid grid-cols-3 gap-2 text-center text-sm">
        <Stat label="المدة" value={`${khatma.durationDays} يوم`} />
        <Stat label="الهدف اليومي" value={`${khatma.dailyTargetAyahs} آية`} />
        <Stat label="أيام متتالية" value={String(run)} />
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
    <div className="ui-elevated rounded-2xl p-3">
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
      className="ui-elevated space-y-4 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onStart(days);
      }}
    >
      <h2 className="text-lg font-bold text-[var(--accent)]">ابدأ ختمة جديدة</h2>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDays(d)}
            aria-pressed={days === d}
            className={`rounded-full px-4 py-2 text-sm transition ${
              days === d ? 'bg-[var(--primary-bg)] font-semibold text-[var(--primary-fg)]' : 'bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--fg)]'
            }`}
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
      <button type="submit" disabled={!valid} className="ui-btn-primary w-full rounded-full py-3">
        ابدأ الختمة
      </button>
    </form>
  );
}
