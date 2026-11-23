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
    <section aria-live="polite" className="mt-3 rounded-2xl bg-[var(--surface-2)] p-4 text-[0.75rem] leading-8">
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
        // Keyed by ayah too: switching ayahs (mushaf view) never keeps the previous "full passage" toggle.
        state.data.map((t) => <TafsirEntry key={`${ayahId}-${t.bookId}`} tafsir={t} />)}
    </section>
  );
}

const toArabicDigits = (n: number) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);

/**
 * One book's tafsir for the selected ayah. When the book explains several ayahs together
 * (t.passage), either only this ayah's exact part is shown (reliable split) with a button for the
 * full passage, or the whole passage is shown with its ayah range. The text itself is never edited.
 */
function TafsirEntry({ tafsir: t }: { tafsir: PublicTafsir }) {
  const [full, setFull] = useState(false);
  const p = t.passage;
  const range = p ? `${toArabicDigits(p.fromAyah)}–${toArabicDigits(p.toAyah)}` : '';
  const showSegment = Boolean(p?.split && p.segment) && !full;

  return (
    <article className="[&+&]:mt-5">
      <h3 className="mb-2 text-sm font-bold text-[var(--accent)]">
        {t.bookName}
        {t.author ? ` — ${t.author}` : ''}
      </h3>
      {p && !p.split && (
        <div className="mb-3 space-y-1">
          <span className="ui-badge ui-badge-blue">تفسير الآيات {range} معًا</span>
          <p className="text-xs leading-6 text-[var(--muted)]">
            شرح المؤلف هذه الآيات في موضع واحد، فيُعرض النص كاملًا كما ورد في المصدر.
          </p>
        </div>
      )}
      {p?.split && (
        <p className="mb-2 text-xs leading-6 text-[var(--muted)]">
          {full
            ? `تفسير الآيات ${range} كاملًا كما ورد في المصدر.`
            : `هذا تفسير الآية المختارة، من موضع واحد شرح فيه المؤلف الآيات ${range}.`}
        </p>
      )}
      <TafsirText content={showSegment && p?.segment ? p.segment : t.content} />
      {p?.split && (
        <button
          type="button"
          onClick={() => setFull((f) => !f)}
          aria-expanded={full}
          className="mt-3 text-xs font-semibold text-[var(--accent)] underline underline-offset-4"
        >
          {full ? 'عرض تفسير الآية المختارة فقط' : `عرض تفسير الآيات ${range} كاملًا`}
        </button>
      )}
    </article>
  );
}
