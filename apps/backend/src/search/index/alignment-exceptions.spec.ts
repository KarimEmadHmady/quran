import { parseRef } from '../golden/golden-set';
import {
  KNOWN_ALIGNMENT_CASES,
  SPELLING_DIFFERENCES_IN_MERGES,
  VOCATIVE_MERGE_AYAHS,
  VOCATIVE_SIMPLE_WORD,
} from './alignment-exceptions';

describe('alignment exceptions (documentation as data)', () => {
  it('344 vocatives + 20 documented cases = the 364 ayahs whose word counts differ', () => {
    expect(VOCATIVE_MERGE_AYAHS).toBe(344);
    expect(KNOWN_ALIGNMENT_CASES).toHaveLength(20);
    expect(VOCATIVE_MERGE_AYAHS + KNOWN_ALIGNMENT_CASES.length).toBe(364);
    expect(VOCATIVE_SIMPLE_WORD).toBe('يا');
  });

  it('documented cases have unique, valid refs and well-formed groups', () => {
    const refs = KNOWN_ALIGNMENT_CASES.map((c) => c.ref);
    expect(new Set(refs).size).toBe(refs.length);
    for (const c of KNOWN_ALIGNMENT_CASES) {
      expect(parseRef(c.ref)).not.toBeNull();
      expect(c.merges.length + c.unmappedUthmani.length).toBeGreaterThan(0);
      for (const [start, count, u] of c.merges) {
        expect(start).toBeGreaterThanOrEqual(0);
        expect([2, 3]).toContain(count);
        expect(u).toBeLessThanOrEqual(start); // Uthmani index never runs ahead without skips
      }
    }
  });

  it('every documented spelling difference lies inside a merged group', () => {
    const known = new Map(KNOWN_ALIGNMENT_CASES.map((c) => [c.ref, c]));
    for (const entry of SPELLING_DIFFERENCES_IN_MERGES) {
      const [r, w] = entry.split('#');
      const word = Number(w);
      const c = known.get(r);
      // Either a documented case covering the word, or a single vocative merge (word 0/1 of a pair).
      if (c) {
        expect(c.merges.some(([s, n]) => word >= s && word < s + n)).toBe(true);
      } else {
        expect(parseRef(r)).not.toBeNull();
        expect(word).toBeGreaterThan(0);
      }
    }
  });
});
