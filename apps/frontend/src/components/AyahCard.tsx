import type { SearchResult } from '@/lib/api';
import { REF_BADGE, REF_NUMBER } from '@/lib/refBadge';
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
export function AyahCard({
  result,
  position,
  onTafsir,
}: {
  result: SearchResult;
  /** 1-based rank across all result pages (design: number circle; the top hit is green). */
  position?: number;
  /** Shown only when the ayah has a tafsir. */
  onTafsir?: () => void;
}) {
  const approximate = result.confidence !== 'high';
  return (
    <article className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_2px_12px_rgb(0_0_0/0.04)]">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-sm text-[var(--muted)]">
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          {position !== undefined && (
            <span
              className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-semibold ${
                position === 1 ? 'bg-[var(--tile-mint-icon)] text-[var(--accent)]' : 'bg-[var(--surface-2)] text-[var(--muted)]'
              }`}
            >
              {position.toLocaleString('ar-EG')}
            </span>
          )}
          {/* «الرحمن - آية 1» as the reference badge (same as topic pages), «(55:1)» as a quieter pill. */}
          <span className={REF_BADGE}>
            {result.suraName} - آية {result.ayahNumber}
          </span>
          <span className={REF_NUMBER} dir="ltr">
            ({result.ref})
          </span>
        </span>
        <span className={`ui-badge ${approximate ? 'ui-badge-blue' : 'ui-badge-green'}`}>{MATCH_LABEL[result.matchType]}</span>
      </header>
      {/* Design: matched words as soft rounded amber pills (scoped to this card). */}
      <p className="quran-text [&_mark.hl]:rounded-lg [&_mark.hl]:px-2 [&_mark.hl]:py-1 [&_mark.hl]:[box-decoration-break:clone]">

        <HighlightedText text={result.textUthmani} highlights={result.highlights} />
      </p>
      {/* Phones: smaller chips (padding, gap, font, icon) so all three stay on one row; desktop unchanged. */}
      <footer className="mt-3 flex flex-wrap justify-start gap-1.5 border-t border-[var(--border)] pt-3 sm:gap-2 max-sm:[&_.ui-chip]:gap-1 max-sm:[&_.ui-chip]:whitespace-nowrap max-sm:[&_.ui-chip]:px-2.5 max-sm:[&_.ui-chip]:py-1 max-sm:[&_.ui-chip]:text-xs max-sm:[&_svg]:h-3.5 max-sm:[&_svg]:w-3.5">
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
