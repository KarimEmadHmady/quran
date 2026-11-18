'use client';

import Link from 'next/link';
import { Icon } from '@/components/Icon';
import type { Dhikr } from '@/lib/adhkarApi';
import { useAdhkarStore } from '@/store/useAdhkarStore';
import { AdhkarAudioButton } from './AdhkarAudioButton';

const toArabicDigits = (n: number) => n.toLocaleString('ar-EG');

/**
 * One dhikr: the full text exactly as stored (never shortened or rewritten), the required
 * repetitions, a tap counter with the remaining count, reset, favourite and audio.
 * `categoryTitle` + `showCategoryLink` are used outside the category page (favourites).
 */
export function DhikrCard({
  dhikr,
  categoryTitle,
  showCategoryLink = false,
}: {
  dhikr: Dhikr;
  categoryTitle?: string;
  showCategoryLink?: boolean;
}) {
  const { categoryId, number, repeatCount } = dhikr;
  const hydrated = useAdhkarStore((s) => s.hydrated);
  const done = useAdhkarStore((s) => (s.hydrated ? s.count(categoryId, number) : 0));
  // Subscribe to the progress object so a new period / reset re-renders.
  useAdhkarStore((s) => s.progress);
  const favorite = useAdhkarStore((s) => s.favorites.includes(`${categoryId}:${number}`));
  const increment = useAdhkarStore((s) => s.increment);
  const resetItem = useAdhkarStore((s) => s.resetItem);
  const toggleFavorite = useAdhkarStore((s) => s.toggleFavorite);

  const remaining = Math.max(0, repeatCount - done);
  const complete = remaining === 0;
  const pct = Math.min(100, Math.round((done / repeatCount) * 100));

  return (
    <article
      id={`dhikr-${number}`}
      className={`ui-card p-4 transition ${complete ? 'border-[var(--success)]' : ''}`}
      aria-label={`الذكر ${toArabicDigits(number)}`}
    >
      <header className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <span className="ui-num">{toArabicDigits(number)}</span>
        {showCategoryLink && categoryTitle && (
          <Link href={`/adhkar/${categoryId}#dhikr-${number}`} className="text-[var(--accent)] hover:underline">
            {categoryTitle}
          </Link>
        )}
        <span className="ui-badge ui-badge-blue">
          {repeatCount === 1 ? 'مرة واحدة' : `${toArabicDigits(repeatCount)} مرات`}
        </span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => toggleFavorite(categoryId, number)}
          aria-pressed={favorite}
          aria-label={favorite ? 'إزالة من المفضلة' : 'إضافة للمفضلة'}
          className={`rounded-full p-1.5 hover:bg-[var(--surface-2)] ${favorite ? 'text-[var(--danger)]' : 'text-[var(--muted)]'}`}
          disabled={!hydrated}
        >
          <Icon name="heart" filled={favorite} className="h-5 w-5" />
        </button>
      </header>

      <p className="quran-text whitespace-pre-line text-right" dir="rtl" lang="ar">
        {dhikr.text}
      </p>

      <footer className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => increment(categoryId, number, repeatCount)}
          disabled={!hydrated || complete}
          aria-label={
            complete
              ? 'اكتمل العدد'
              : `تسبيح: تم ${toArabicDigits(done)} من ${toArabicDigits(repeatCount)}، متبقي ${toArabicDigits(remaining)}`
          }
          className={`relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-lg font-bold transition active:scale-95 ${
            complete ? 'bg-[var(--success)] text-white' : 'ui-btn-primary'
          }`}
          style={
            complete
              ? undefined
              : { boxShadow: `inset 0 0 0 4px color-mix(in srgb, var(--accent) ${pct}%, transparent)` }
          }
        >
          {complete ? <Icon name="check" className="h-7 w-7" /> : toArabicDigits(remaining)}
        </button>
        <div className="min-w-0 flex-1 text-sm" aria-live="polite">
          {complete ? (
            <span className="font-semibold text-[var(--success)]">تم ✓ اكتمل العدد</span>
          ) : (
            <span className="text-[var(--muted)]">
              اضغط للعدّ · متبقي <b className="text-[var(--fg)]">{toArabicDigits(remaining)}</b> من {toArabicDigits(repeatCount)}
            </span>
          )}
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--track)]">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${pct}%`, background: complete ? 'var(--success)' : 'var(--accent)' }}
            />
          </div>
        </div>
        {done > 0 && (
          <button
            type="button"
            onClick={() => resetItem(categoryId, number)}
            className="ui-chip"
            aria-label="إعادة العدّ لهذا الذكر"
          >
            <Icon name="reset" className="h-4 w-4" />
            إعادة
          </button>
        )}
        <AdhkarAudioButton id={`item:${categoryId}:${number}`} path={dhikr.audioUrl} label={`الذكر ${number}`} compact />
      </footer>
    </article>
  );
}
