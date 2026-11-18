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
      <div className="ui-hero flex flex-wrap items-center gap-3 px-5 py-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {allDone ? 'أتممت أذكار هذا القسم ✓' : `أتممت ${num(completed)} من ${num(items.length)}`}
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface)]/40">
            <div
              className="h-full rounded-full bg-[var(--accent)] transition-all"
              style={{ width: `${Math.round((completed / items.length) * 100)}%` }}
            />
          </div>
        </div>
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
