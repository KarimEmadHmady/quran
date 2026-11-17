import type { SearchResult } from '@/lib/api';
import { AyahPlayButton } from './audio/AyahPlayButton';
import { CartToggle } from './CartToggle';
import { Icon } from './Icon';
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
export function AyahCard({ result, onTafsir }: { result: SearchResult; /** Shown only when the ayah has a tafsir. */ onTafsir?: () => void }) {
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
      {/* Phones: smaller chips (padding, gap, font, icon) so all three stay on one row; desktop unchanged. */}
      <footer className="mt-3 flex flex-wrap justify-end gap-1.5 border-t border-[var(--border)] pt-3 sm:gap-2 max-sm:[&_.ui-chip]:gap-1 max-sm:[&_.ui-chip]:whitespace-nowrap max-sm:[&_.ui-chip]:px-2.5 max-sm:[&_.ui-chip]:py-1 max-sm:[&_.ui-chip]:text-xs max-sm:[&_svg]:h-3.5 max-sm:[&_svg]:w-3.5">
        {onTafsir && (
          <button type="button" onClick={onTafsir} className="ui-chip">
            <Icon name="tafsir" className="h-4 w-4" />
            تفسير
          </button>
        )}
        <AyahPlayButton suraNumber={result.suraNumber} ayahNumber={result.ayahNumber} />
        <CartToggle ayahId={result.ayahId} />
      </footer>
    </article>
  );
}
