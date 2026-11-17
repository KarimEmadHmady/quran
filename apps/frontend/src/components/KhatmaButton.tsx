'use client';

import { useKhatmaStore } from '@/store/useKhatmaStore';
import { Icon } from './Icon';

/**
 * "تمت القراءة" (claude.md 11.15 decision 1): the ONLY way khatma progress moves; scrolling
 * never counts. It marks everything up to this ayah as read; already-read ayahs show a
 * disabled check, so an ayah can never be completed twice. Hidden without an active khatma.
 */
export function KhatmaButton({ ayahId }: { ayahId: number }) {
  const khatma = useKhatmaStore((s) => s.khatma);
  const markRead = useKhatmaStore((s) => s.markRead);
  if (!khatma) return null;

  if (ayahId <= khatma.lastAyahId) {
    return (
      <span className="ui-chip !border-transparent !bg-[var(--badge-green-bg)] !text-[var(--badge-green-fg)]">
        ✓ مقروءة
      </span>
    );
  }
  const count = ayahId - khatma.lastAyahId;
  return (
    <button
      type="button"
      onClick={() => markRead(ayahId)}
      title={count > 1 ? `هيتعلّم ${count} آية كمقروءة (من بعد آخر آية قرأتها لحد هنا)` : undefined}
      className="ui-chip"
    >
      <Icon name="check" className="h-4 w-4" />
      تمت القراءة
    </button>
  );
}
