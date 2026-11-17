import type { SearchResult } from '@/lib/api';
import { CartToggle } from './CartToggle';
import { HighlightedText } from './HighlightedText';

const MATCH_LABEL: Record<SearchResult['matchType'], string> = {
  reference: 'مرجع',
  phrase: 'عبارة',
  ordered: 'نفس الترتيب',
  all_terms: 'كل الكلمات',
  corrected: 'بعد التصحيح',
  partial: 'تطابق جزئي',
  loose: 'تقريبي',
};

/** A search result (design: muted "سورة - آية" line, ayah text, highlighted matches). */
export function AyahCard({ result }: { result: SearchResult }) {
  const approximate = result.confidence !== 'high';
  return (
    <article className="ui-card p-5">
      <header className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--muted)]">
        <span>
          سورة {result.suraName} · آية <strong className="text-[var(--fg)]">{result.ayahNumber}</strong>
          <span className="ms-2 text-xs" dir="ltr">
            ({result.ref})
          </span>
        </span>
        <span className={`ui-badge ${approximate ? 'ui-badge-blue' : 'ui-badge-green'}`}>{MATCH_LABEL[result.matchType]}</span>
      </header>
      <p className="quran-text">
        <HighlightedText text={result.textUthmani} highlights={result.highlights} />
      </p>
      <footer className="mt-3 flex justify-end border-t border-[var(--border)] pt-3">
        <CartToggle ayahId={result.ayahId} />
      </footer>
    </article>
  );
}
