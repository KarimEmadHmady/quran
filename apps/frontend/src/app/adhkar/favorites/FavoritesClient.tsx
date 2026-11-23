'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { DhikrCard } from '@/components/adhkar/DhikrCard';
import { dhikrKey } from '@/lib/adhkar';
import { adhkarApi, adhkarErrorMessage, type AdhkarCategoryWithItems } from '@/lib/adhkarApi';
import { useAdhkarAudioStore } from '@/store/useAdhkarAudioStore';
import { useAdhkarStore } from '@/store/useAdhkarStore';

export function FavoritesClient() {
  const hydrated = useAdhkarStore((s) => s.hydrated);
  const favorites = useAdhkarStore((s) => s.favorites);
  const [all, setAll] = useState<AdhkarCategoryWithItems[] | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const hasFavorites = favorites.length > 0;

  // One request for the whole (small) set, only when there is something to show.
  useEffect(() => {
    if (!hydrated || !hasFavorites || all) return;
    const ctrl = new AbortController();
    setError('');
    adhkarApi
      .all(ctrl.signal)
      .then(setAll)
      .catch((e: unknown) => !ctrl.signal.aborted && setError(adhkarErrorMessage(e)));
    return () => ctrl.abort();
  }, [hydrated, hasFavorites, all, attempt]);

  useEffect(() => () => useAdhkarAudioStore.getState().stop(), []);

  if (!hydrated) return <p className="text-[var(--muted)]" role="status">جاري التحميل…</p>;

  if (!hasFavorites) {
    return (
      <div className="ui-elevated px-6 py-10 text-center" role="status">
        <p className="font-semibold">مفيش أذكار في المفضلة لسه.</p>
        <p className="mt-1 text-sm text-[var(--muted)]">اضغط على ♡ في أي ذكر عشان يظهر هنا.</p>
        <Link href="/adhkar" className="ui-chip mt-4">
          تصفّح الأذكار
        </Link>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3 py-6 text-center" role="alert">
        <p className="text-[var(--danger)]">{error}</p>
        <button type="button" onClick={() => setAttempt((a) => a + 1)} className="ui-btn-primary px-6 py-2.5">
          إعادة المحاولة
        </button>
      </div>
    );
  }

  if (!all) return <p className="text-[var(--muted)]" role="status">جاري تحميل المفضلة…</p>;

  // Most recently added first; favourites whose dhikr no longer exists are simply not shown.
  const index = new Map(
    all.flatMap((c) => c.items.map((i) => [dhikrKey(c.id, i.number), { item: i, title: c.title }] as const)),
  );
  const shown = favorites.map((k) => index.get(k)).filter((x) => x !== undefined);

  return (
    <ol className="space-y-3">
      {shown.map(({ item, title }) => (
        <li key={dhikrKey(item.categoryId, item.number)}>
          <DhikrCard dhikr={item} categoryTitle={title} showCategoryLink />
        </li>
      ))}
    </ol>
  );
}
