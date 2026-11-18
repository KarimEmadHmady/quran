'use client';

import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import { Icon } from '@/components/Icon';
import { effectivePref, isReminderWindow } from '@/lib/adhkar';
import {
  ADHKAR_SEARCH_MAX_LENGTH,
  adhkarApi,
  adhkarErrorMessage,
  type AdhkarCategory,
  type AdhkarSearchResponse,
  type ReminderDefinition,
  type ReminderKey,
} from '@/lib/adhkarApi';
import { useAdhkarStore } from '@/store/useAdhkarStore';

const SEARCH_DEBOUNCE_MS = 250;
const num = (n: number) => n.toLocaleString('ar-EG');

/** The slot that fits the current hour (a suggestion, independent from reminder settings). */
function suggestedSlot(now: Date): ReminderKey | null {
  const h = now.getHours();
  if (h >= 4 && h < 12) return 'morning';
  if (h >= 15 && h < 21) return 'evening';
  if (h >= 21 || h < 2) return 'sleep';
  return null;
}

function CategoryRow({ c }: { c: AdhkarCategory }) {
  return (
    <Link href={`/adhkar/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--surface-2)]">
      <span className="ui-num">{num(c.order)}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold">{c.title}</span>
        <span className="text-xs text-[var(--muted)]">{c.itemCount === 1 ? 'ذكر واحد' : `${num(c.itemCount)} أذكار`}</span>
      </span>
      {c.audioUrl && <Icon name="headphones" className="h-4 w-4 shrink-0 text-[var(--muted)]" />}
      <Icon name="chevron" className="h-4 w-4 shrink-0 text-[var(--muted)]" />
    </Link>
  );
}

function SearchResults({ res, query }: { res: AdhkarSearchResponse; query: string }) {
  if (res.categories.length === 0 && res.items.length === 0) {
    return (
      <div className="ui-card px-6 py-8 text-center" role="status">
        <p className="font-semibold">مفيش نتائج لـ «{query}»</p>
      </div>
    );
  }
  return (
    <div className="space-y-4" role="region" aria-label="نتائج البحث">
      {res.categories.length > 0 && (
        <div>
          <h2 className="ui-section-label mb-2">الأقسام ({num(res.categories.length)})</h2>
          <ul className="ui-card divide-y divide-[var(--border)] overflow-hidden">
            {res.categories.map((c) => (
              <li key={c.id}>
                <CategoryRow c={c} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {res.items.length > 0 && (
        <div>
          <h2 className="ui-section-label mb-2">
            الأذكار ({num(res.total)}){res.truncated ? ` · أول ${num(res.items.length)}` : ''}
          </h2>
          <ul className="space-y-2">
            {res.items.map(({ category, item }) => (
              <li key={`${item.categoryId}:${item.number}`}>
                <Link
                  href={`/adhkar/${category.id}#dhikr-${item.number}`}
                  className="ui-card block p-4 hover:border-[var(--accent)]"
                >
                  <span className="mb-1 block text-xs text-[var(--accent)]">
                    {category.title} · الذكر {num(item.number)}
                  </span>
                  <span className="block font-[family-name:var(--font-quran)] text-lg leading-loose">{item.text}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function AdhkarHomeClient({
  categories,
  reminders,
}: {
  categories: AdhkarCategory[];
  reminders: ReminderDefinition[];
}) {
  const inputId = useId();
  const [query, setQuery] = useState('');
  const [res, setRes] = useState<AdhkarSearchResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const hydrated = useAdhkarStore((s) => s.hydrated);
  const recent = useAdhkarStore((s) => s.recent);
  const favCount = useAdhkarStore((s) => s.favorites.length);
  const prefs = useAdhkarStore((s) => s.reminders);

  // Time-based content only after mount (server and client clocks / time zones differ).
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const q = query.trim();
  useEffect(() => {
    if (!q) {
      setRes(null);
      setError('');
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(() => {
      adhkarApi
        .search(q, ctrl.signal)
        .then((r) => {
          setRes(r);
          setError('');
        })
        .catch((e: unknown) => {
          if (ctrl.signal.aborted) return;
          setError(adhkarErrorMessage(e));
        })
        .finally(() => !ctrl.signal.aborted && setLoading(false));
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const byKey = new Map(reminders.map((r) => [r.key, r]));
  // Due now: an enabled reminder inside its window; otherwise the slot that fits the hour.
  const due = now && hydrated ? reminders.filter((r) => {
    const p = effectivePref(r, prefs);
    return p.enabled && isReminderWindow(p.time, now);
  }) : [];
  const slot = now ? suggestedSlot(now) : null;
  const suggestion = slot ? byKey.get(slot) : undefined;
  const highlighted = due.length > 0 ? due : suggestion ? [suggestion] : [];

  return (
    <div className="space-y-5">
      <div className="ui-hero p-5">
        <p className="flex items-center gap-2 text-lg font-bold">
          <Icon name="beads" className="h-6 w-6" />
          أهلًا بك في الأذكار
        </p>
        <p className="mt-1 text-sm text-[var(--hero-muted)]">
          أذكار اليوم والليلة من حصن المسلم: {num(categories.length)} قسمًا، بالترتيب، مع العدد والصوت.
        </p>
        {highlighted.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {highlighted.map((r) => (
              <Link
                key={r.key}
                href={`/adhkar/${r.categoryId}`}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--fg)]"
              >
                <Icon name="bell" className="h-4 w-4 text-[var(--accent)]" />
                {due.length > 0 ? `حان وقت ${r.label}` : `مقترح الآن: ${r.label}`}
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link href="/adhkar/favorites" className="ui-card flex items-center gap-3 p-4 hover:border-[var(--accent)]">
          <Icon name="heart" className="h-6 w-6 text-[var(--danger)]" />
          <span>
            <span className="block font-semibold">المفضلة</span>
            <span className="text-xs text-[var(--muted)]">{hydrated ? `${num(favCount)} ذكر` : '…'}</span>
          </span>
        </Link>
        <Link href="/adhkar/reminders" className="ui-card flex items-center gap-3 p-4 hover:border-[var(--accent)]">
          <Icon name="bell" className="h-6 w-6 text-[var(--accent)]" />
          <span>
            <span className="block font-semibold">التذكير</span>
            <span className="text-xs text-[var(--muted)]">
              {hydrated
                ? Object.values(prefs).some((p) => p?.enabled)
                  ? 'مفعّل'
                  : 'غير مفعّل'
                : '…'}
            </span>
          </span>
        </Link>
      </div>

      <div className="relative">
        <label htmlFor={inputId} className="sr-only">
          ابحث في الأذكار
        </label>
        <Icon name="search" className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--muted)]" />
        <input
          id={inputId}
          type="search"
          value={query}
          maxLength={ADHKAR_SEARCH_MAX_LENGTH}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
          placeholder="ابحث في نص الذكر أو اسم القسم…"
          autoComplete="off"
          className="ui-input w-full py-2.5 pe-10 ps-10"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="مسح البحث"
            className="absolute left-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)]"
          >
            <Icon name="close" className="h-4 w-4" />
          </button>
        )}
      </div>

      {q ? (
        error ? (
          <p role="alert" className="text-center text-sm text-[var(--danger)]">
            {error}
          </p>
        ) : loading && !res ? (
          <p className="text-center text-sm text-[var(--muted)]" role="status">
            جاري البحث…
          </p>
        ) : res ? (
          <SearchResults res={res} query={q} />
        ) : null
      ) : (
        <>
          {hydrated && recent.length > 0 && (
            <div>
              <h2 className="ui-section-label mb-2">آخر ما فتحت</h2>
              <div className="flex flex-wrap gap-2">
                {recent.map((r) => (
                  <Link key={r.id} href={`/adhkar/${r.id}`} className="ui-chip">
                    {r.title}
                  </Link>
                ))}
              </div>
            </div>
          )}
          <div>
            <h2 className="ui-section-label mb-2">الأقسام</h2>
            <ul className="ui-card divide-y divide-[var(--border)] overflow-hidden">
              {categories.map((c) => (
                <li key={c.id}>
                  <CategoryRow c={c} />
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
