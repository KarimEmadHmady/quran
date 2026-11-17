import { alignAyah, validateAlignment, type AyahAlignment, type Span } from './alignment';

/** One ayah with both texts (what CorpusLoader returns). */
export interface AlignableAyah {
  suraNumber: number;
  ayahNumber: number;
  textSimple: string;
  textUthmani: string;
}

export type HighlightGranularity = 'part' | 'word';

export interface AlignmentStats {
  ayahs: number;
  positional: number;
  dp: number;
  fallback: number;
  /** Uthmani words that hold two or more simple words. */
  mergedWords: number;
  /** Uthmani words with no simple word. */
  unmappedUthmaniWords: number;
  /** Ayahs whose alignment failed validation (must be 0). */
  invalid: number;
}

/**
 * Alignment of every ayah, in the same doc order as the InvertedIndex (claude.md 5.8):
 * the engine returns matched token positions, rangesFor() turns them into text_uthmani
 * ranges the frontend can highlight with String.slice().
 */
export class AlignmentMap {
  private constructor(
    private readonly items: readonly AyahAlignment[],
    private readonly summary: AlignmentStats,
  ) {}

  static build(corpus: readonly AlignableAyah[]): AlignmentMap {
    const items: AyahAlignment[] = [];
    const s: AlignmentStats = {
      ayahs: corpus.length,
      positional: 0,
      dp: 0,
      fallback: 0,
      mergedWords: 0,
      unmappedUthmaniWords: 0,
      invalid: 0,
    };
    for (const ayah of corpus) {
      const a = alignAyah(ayah.textSimple, ayah.textUthmani);
      items.push(a);
      s[a.method]++;
      s.mergedWords += a.merges.length;
      s.unmappedUthmaniWords += a.unmappedUthmani.length;
      if (a.method !== 'fallback' && validateAlignment(a, ayah.textUthmani).length) s.invalid++;
    }
    return new AlignmentMap(items, s);
  }

  get size(): number {
    return this.items.length;
  }

  get(docIndex: number): AyahAlignment {
    const a = this.items[docIndex];
    if (!a) throw new RangeError(`no alignment for doc ${docIndex}`);
    return a;
  }

  /**
   * Highlight ranges in text_uthmani for matched simple-word positions.
   *  - 'part' (default): exact sub-word spans; e.g. only "أَيُّهَا" inside "يَٰٓأَيُّهَا".
   *  - 'word': whole Uthmani words (safer for Arabic shaping in the browser).
   * Output is sorted, deduplicated, and consecutive words are merged into one range
   * (covering the space between), so a matched phrase is one continuous highlight.
   */
  rangesFor(
    docIndex: number,
    positions: Iterable<number>,
    granularity: HighlightGranularity = 'part',
  ): Span[] {
    const a = this.get(docIndex);
    const unique = [...new Set(positions)].sort((x, y) => x - y);
    for (const p of unique) {
      if (!Number.isInteger(p) || p < 0 || p >= a.simpleCount) {
        throw new RangeError(`word position ${p} out of range for doc ${docIndex}`);
      }
    }
    // Keys that must be adjacent to merge: simple positions ('part') or Uthmani words ('word').
    const units =
      granularity === 'part'
        ? unique.map((p) => ({ key: p, span: a.spans[p] }))
        : [...new Set(unique.map((p) => a.uthmaniIndexOf[p]))].map((u) => ({
            key: u,
            span: a.uthmaniWords[u],
          }));

    const out: Span[] = [];
    let prevKey = -2;
    for (const { key, span } of units) {
      const last = out[out.length - 1];
      if (last && key === prevKey + 1) last.end = span.end;
      else out.push({ start: span.start, end: span.end });
      prevKey = key;
    }
    return out;
  }

  stats(): AlignmentStats {
    return { ...this.summary };
  }
}
