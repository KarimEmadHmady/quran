'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { isFinished, isTodayDone, localDate, progress } from '@/lib/khatma';
import { ayahHref } from '@/lib/quran';
import { useBookmarkStore } from '@/store/useBookmarkStore';
import { useKhatmaStore } from '@/store/useKhatmaStore';
import { Icon } from './Icon';

type SuraInfo = Record<number, { name: string; ayahCount: number }>;

/** Today's weekday + Hijri date (Umm al-Qura), from the device clock. Client-only (time zone). */
export function HomeDate() {
  const [text, setText] = useState('');
  useEffect(() => {
    try {
      setText(
        new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }).format(new Date()),
      );
    } catch {
      // Older engines without the Islamic calendar: just leave the line empty.
    }
  }, []);
  return (
    <p className="flex min-h-5 items-center gap-1.5 text-xs text-[var(--gold)]">
      {text && (
        <>
          <Icon name="calendar" className="h-4 w-4" />
          {text}
        </>
      )}
    </p>
  );
}

const timeFmt = (iso: string) => {
  const d = new Date(iso);
  const today = localDate() === localDate(d);
  const time = d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', numberingSystem: 'latn' } as Intl.DateTimeFormatOptions);
  return today ? `اليوم ${time}` : `${d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', numberingSystem: 'latn' } as Intl.DateTimeFormatOptions)} ${time}`;
};

/** Circular progress ring (design), `value` in 0..1. */
function Ring({ value }: { value: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative flex h-16 w-16 shrink-0 items-center justify-center">
      <svg viewBox="0 0 64 64" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--track)" strokeWidth="5" />
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--gold)" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${c * value} ${c}`} />
      </svg>
      <span className="text-xs font-semibold">{Math.round(value * 100)}%</span>
    </span>
  );
}

/** spec 4.7 "أكمل القراءة من هنا" (design: white "continue" card) + a khatma summary. Independent. */
export function HomeCards({ suras }: { suras: SuraInfo }) {
  const bookmark = useBookmarkStore((s) => s.bookmark);
  const bHydrated = useBookmarkStore((s) => s.hydrated);
  const khatma = useKhatmaStore((s) => s.khatma);
  const kHydrated = useKhatmaStore((s) => s.hydrated);
  if (!bHydrated || !kHydrated) return null;

  const sura = bookmark ? suras[bookmark.suraNumber] : undefined;
  // Position inside the sura (only when the sura length is known).
  const suraProgress = bookmark && sura ? Math.min(1, bookmark.ayahNumber / sura.ayahCount) : null;
  const kProgress = khatma ? progress(khatma) : 0;

  return (
    <div className="space-y-3">
      
      {bookmark && (
        <div className="relative ui-elevated p-5" data-testid="continue-reading">
        <img
          src="/geometry-bg.png"
          alt=""
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 h-42 w-auto select-none opacity-60"
        />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              
              <span className="flex items-center gap-1.5 text-sm text-[var(--gold)]">
                <Icon name="file" className="h-4 w-4" />
                أكمل القراءة من هنا
              </span>
              <span className="mt-2 block text-xl font-bold">سورة {sura?.name ?? bookmark.suraNumber}</span>
              <span className="mt-1 block text-sm text-[var(--muted)]">الآية {bookmark.ayahNumber}</span>
            </div>
            {suraProgress !== null && <Ring value={suraProgress} />}
          </div>
          {suraProgress !== null && (
            <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-[var(--track)]" aria-hidden>
              <div className="h-full rounded-full bg-[var(--primary-bg)]" style={{ width: `${suraProgress * 100}%` }} />
            </div>
          )}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
              <Icon name="calendar" className="h-4 w-4" />
              آخر قراءة: {timeFmt(bookmark.updatedAt)}
            </span>
            <Link
              href={ayahHref(bookmark.suraNumber, bookmark.ayahId)}
              className="ui-btn-primary flex items-center gap-2 rounded-full px-5 py-2.5 text-sm"
            >
              <Icon name="book" className="h-4 w-4" />
              متابعة القراءة
            </Link>
          </div>
        </div>
      )}
      <Link href="/khatma" className="ui-elevated block p-4 transition hover:-translate-y-0.5">
        <span className="flex items-center justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-sm text-[var(--gold)]">الورد اليومى </span>
            <span className="font-bold">
              {!khatma
                ? 'ابدأ خطة ختمة'
                : isFinished(khatma)
                  ? 'ختمت القرآن ✓'
                  : `${Math.round(kProgress * 1000) / 10}% · ${isTodayDone(khatma, localDate()) ? 'ورد النهارده خلص ✓' : 'اجعل للقرآن نصيبًا من يومك'}`}
            </span>
          </span>
          <Icon name="chevron" className="h-5 w-5 shrink-0 text-[var(--muted)]" />
        </span>
        {khatma && (
          <span className="mt-3 block h-1.5 overflow-hidden rounded-full bg-[var(--track)]" aria-hidden>
            <span className="block h-full rounded-full bg-[var(--gold)]" style={{ width: `${kProgress * 100}%` }} />
          </span>
        )}
      </Link>
    </div>
  );
}
