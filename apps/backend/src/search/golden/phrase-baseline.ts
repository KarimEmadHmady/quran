import { normalize } from '@quran/text-utils';
import type { SearchFn, SearchHit } from './metrics';

export interface BaselineDoc {
  ref: string;
  textSimple: string;
}

/** True when the normalized query occurs in the normalized text as whole, contiguous words. */
export function containsPhrase(normalizedText: string, normalizedQuery: string): boolean {
  if (normalizedQuery === '') return false;
  return ` ${normalizedText} `.includes(` ${normalizedQuery} `);
}

/**
 * The simplest possible search, used as the scorer's reference point: exact normalized phrase
 * match, results in mushaf order, no references, no ranking, no tolerance. The real engine
 * must beat it. It is also the definition of truth for phrase-type golden cases.
 */
export function createPhraseBaseline(docs: readonly BaselineDoc[]): SearchFn {
  const indexed = docs.map((d) => ({ ref: d.ref, text: normalize(d.textSimple) }));
  return (q) => {
    const query = normalize(q);
    const hits: SearchHit[] = indexed
      .filter((d) => containsPhrase(d.text, query))
      .map((d) => ({ ref: d.ref, confidence: 'high' }));
    return Promise.resolve(hits);
  };
}
