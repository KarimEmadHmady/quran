/**
 * Ayah reference badge («سورة … · آية …»): gold text on the sand tile, bold. Shared by the
 * reading/topic lists (AyahList, both layouts) and the search results (AyahCard) so they match.
 */
export const REF_BADGE =
  'inline-flex w-fit items-center rounded-full border border-[var(--gold)]/30 bg-[var(--tile-sand)] px-3 py-1 font-[family-name:var(--font-ui)] text-[0.75rem] font-bold leading-6 text-[var(--gold)] ';

/** Secondary pill for the numeric reference «(55:1)», next to REF_BADGE. */
export const REF_NUMBER =
  'inline-flex items-center rounded-full bg-[var(--surface-2)] px-2.5 py-0.5 font-[family-name:var(--font-ui)] text-xs font-semibold tabular-nums leading-6 text-[var(--muted)]';
