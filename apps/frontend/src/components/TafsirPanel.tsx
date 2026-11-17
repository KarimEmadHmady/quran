'use client';

import { useEffect, useState } from 'react';
import { tafsirsForAyah } from '@/lib/api';
import type { PublicTafsir } from '@/lib/quran';
import { TafsirText } from './TafsirText';

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'done'; data: PublicTafsir[] };

/**
 * The ayah's tafsir from the confirmed books (today only Al-Qurtubi). Side-by-side comparison
 * (spec 4.6) waits for a second confirmed book (claude.md 11.15 decision 5).
 */
export function TafsirPanel({ ayahId }: { ayahId: number }) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setState({ kind: 'loading' });
    tafsirsForAyah(ayahId, ctrl.signal)
      .then((data) => setState({ kind: 'done', data }))
      .catch(() => !ctrl.signal.aborted && setState({ kind: 'error' }));
    return () => ctrl.abort();
  }, [ayahId, retry]);

  return (
    <section aria-live="polite" className="mt-3 rounded-2xl bg-[var(--surface-2)] p-4 text-[0.95rem] leading-8">
      {state.kind === 'loading' && <p className="text-[var(--muted)]">جاري تحميل التفسير…</p>}
      {state.kind === 'error' && (
        <p className="text-[var(--danger)]">
          تعذّر تحميل التفسير.{' '}
          <button type="button" className="underline" onClick={() => setRetry((n) => n + 1)}>
            إعادة المحاولة
          </button>
        </p>
      )}
      {state.kind === 'done' && state.data.length === 0 && (
        <p className="text-[var(--muted)]">التفسير غير متوفر لهذه الآية.</p>
      )}
      {state.kind === 'done' &&
        state.data.map((t) => (
          <article key={t.bookId} className="[&+&]:mt-5">
            <h3 className="mb-2 text-sm font-bold text-[var(--accent)]">
              {t.bookName}
              {t.author ? ` — ${t.author}` : ''}
            </h3>
            <TafsirText content={t.content} />
          </article>
        ))}
    </section>
  );
}
