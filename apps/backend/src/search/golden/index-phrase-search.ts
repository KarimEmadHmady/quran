import type { InvertedIndex } from '../index/inverted-index';
import type { SearchFn } from './metrics';

/**
 * Exact-phrase search backed by the inverted index (positional intersection). Same contract
 * and result order as the linear-scan baseline, so the two can be compared case by case:
 * identical results prove the postings and positions are correct.
 */
export function createIndexPhraseSearch(index: InvertedIndex): SearchFn {
  return (q) =>
    Promise.resolve(
      index
        .findPhraseText(q)
        .map((m) => ({ ref: index.doc(m.docIndex).ref, confidence: 'high' as const })),
    );
}
