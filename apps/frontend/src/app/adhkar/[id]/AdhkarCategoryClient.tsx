'use client';

import { useEffect } from 'react';
import { AdhkarAudioButton } from '@/components/adhkar/AdhkarAudioButton';
import { DhikrCard } from '@/components/adhkar/DhikrCard';
import { Icon } from '@/components/Icon';
import type { AdhkarCategory, Dhikr } from '@/lib/adhkarApi';
import { useAdhkarAudioStore } from '@/store/useAdhkarAudioStore';
import { useAdhkarStore } from '@/store/useAdhkarStore';

const num = (n: number) => n.toLocaleString('ar-EG');

/** Category header (progress, whole-category audio, reset) + the dhikr cards in source order. */
export function AdhkarCategoryClient({ category, items }: { category: AdhkarCategory; items: Dhikr[] }) {
  const hydrated = useAdhkarStore((s) => s.hydrated);
  useAdhkarStore((s) => s.progress); // re-render on any counter change
  const count = useAdhkarStore((s) => s.count);
  const visit = useAdhkarStore((s) => s.visit);
  const resetCategory = useAdhkarStore((s) => s.resetCategory);

  // Recently opened categories.
  useEffect(() => {
    if (hydrated) visit({ id: category.id, title: category.title });
  }, [hydrated, category.id, category.title, visit]);

  // Leaving the category stops its recording (the Quran player is never touched).
  useEffect(() => () => useAdhkarAudioStore.getState().stop(), []);

  // A #dhikr-N link (search / favourites / notification) after the cards are rendered.
  useEffect(() => {
    const hash = window.location.hash;
    if (!/^#dhikr-[0-9]{1,5}$/.test(hash)) return;
    requestAnimationFrame(() => document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' }));
  }, []);

  const completed = hydrated ? items.filter((i) => count(category.id, i.number) >= i.repeatCount).length : 0;
  const started = hydrated && items.some((i) => count(category.id, i.number) > 0);
  const allDone = completed === items.length;

  return (
    <div className="space-y-4">
      {/* Green hero (same as the topic page): title, counts, progress, whole-category audio, reset. */}
      <div className="relative overflow-hidden rounded-[1.5rem] bg-[var(--hero)] px-5 py-6 text-[var(--hero-fg)] shadow-[var(--shadow-card)]">
        {/* eslint-disable-next-line @next/next/no-img-element -- decorative static image */}
        <img
          src="/geometry-bg.png"
          alt=""
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 h-44 w-auto select-none opacity-60"
        />
        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs text-[var(--hero-muted)]">
            <Icon name="beads" className="h-3.5 w-3.5" />
            {items.length === 1 ? 'ذكر واحد' : `${num(items.length)} أذكار`}
          </span>
          <p className="mt-3 text-2xl font-bold leading-snug">{category.title}</p>
          <p className="mt-3 text-sm font-semibold">
            {allDone ? 'أتممت أذكار هذا القسم ✓' : `أتممت ${num(completed)} من ${num(items.length)}`}
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full rounded-full bg-[var(--brand-gold)] transition-all"
              style={{ width: `${Math.round((completed / items.length) * 100)}%` }}
            />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 [&_.ui-chip]:border-white/20 [&_.ui-chip]:bg-white/10 [&_.ui-chip]:text-white">
            <AdhkarAudioButton id={`category:${category.id}`} path={category.audioUrl} label={`القسم كاملًا: ${category.title}`} />
            {started && (
              <button
                type="button"
                onClick={() => window.confirm('إعادة كل العدّادات في هذا القسم؟') && resetCategory(category.id)}
                className="ui-chip"
              >
                <Icon name="reset" className="h-4 w-4" />
                إعادة الكل
              </button>
            )}
          </div>
        </div>
      </div>

      <ol className="space-y-3">
        {items.map((d) => (
          <li key={d.number}>
            <DhikrCard dhikr={d} />
          </li>
        ))}
      </ol>
    </div>
  );
}
