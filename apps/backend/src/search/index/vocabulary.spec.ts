import { computeIdf, trigrams, Vocabulary } from './vocabulary';

describe('computeIdf (BM25)', () => {
  it('matches the formula ln(1 + (N - df + 0.5) / (df + 0.5))', () => {
    expect(computeIdf(6236, 1)).toBeCloseTo(Math.log(1 + 6235.5 / 1.5));
    expect(computeIdf(10, 5)).toBeCloseTo(Math.log(2));
  });

  it('is positive even for a word in every doc, and decreases with df', () => {
    expect(computeIdf(100, 100)).toBeGreaterThan(0);
    expect(computeIdf(100, 1)).toBeGreaterThan(computeIdf(100, 10));
    expect(computeIdf(100, 10)).toBeGreaterThan(computeIdf(100, 90));
  });

  it.each([
    [0, 1],
    [10, 0],
    [10, 11],
  ])('rejects N=%p df=%p', (n, df) => {
    expect(() => computeIdf(n, df)).toThrow(RangeError);
  });
});

describe('Vocabulary', () => {
  const entries = [
    { word: 'a', termId: 0, df: 2, cf: 3, idf: 1 },
    { word: 'b', termId: 1, df: 1, cf: 1, idf: 2 },
  ];
  const vocab = new Vocabulary(entries);

  it('looks words up and exposes entries in order', () => {
    expect(vocab.size).toBe(2);
    expect(vocab.has('a')).toBe(true);
    expect(vocab.has('z')).toBe(false);
    expect(vocab.get('b')).toEqual(entries[1]);
    expect(vocab.get('z')).toBeUndefined();
    expect(vocab.entries()).toEqual(entries);
  });
});

describe('Vocabulary: corrector lookups (claude.md 5.4)', () => {
  const words = ['الصلاه', 'السلاه', 'الصلوه', 'الرحمن', 'الرحيم', 'الرحمه', 'رب', 'ربك'];
  const vocab = new Vocabulary(
    words.map((word, termId) => ({ word, termId, df: 10 - termId, cf: 10, idf: 1 })),
  );

  it('trigrams() pads the word and dedupes', () => {
    expect(trigrams('رب')).toEqual(['^رب', 'رب$']);
    expect(trigrams('ااا')).toEqual(['^اا', 'ااا', 'اا$']);
    expect(trigrams('')).toEqual([]);
  });

  it('byPhonetic / bySkeleton group words by key', () => {
    expect(vocab.byPhonetic('السلاه')).toEqual(['الصلاه', 'السلاه']);
    expect(vocab.bySkeleton('السله')).toEqual(['الصلاه', 'السلاه', 'الصلوه']);
    expect(vocab.byPhonetic('غير')).toEqual([]);
    expect(vocab.bySkeleton('غير')).toEqual([]);
  });

  it('trigramNeighbours() returns words sharing a trigram', () => {
    const n = vocab.trigramNeighbours('الرحنم');
    expect(n.has('الرحمن')).toBe(true);
    expect(n.has('رب')).toBe(false);
    expect(vocab.trigramNeighbours('xyz').size).toBe(0);
  });

  it('withPrefix() lists words by frequency, then alphabetically, up to the limit', () => {
    expect(vocab.withPrefix('الرح', 5)).toEqual(['الرحمن', 'الرحيم', 'الرحمه']);
    expect(vocab.withPrefix('الرح', 2)).toEqual(['الرحمن', 'الرحيم']);
    expect(vocab.withPrefix('رب', 5)).toEqual(['رب', 'ربك']);
    expect(vocab.withPrefix('ي', 5)).toEqual([]);
    expect(vocab.withPrefix('', 5)).toEqual([]);
    expect(vocab.withPrefix('رب', 0)).toEqual([]);
    const tie = new Vocabulary([
      { word: 'بب', termId: 0, df: 1, cf: 1, idf: 1 },
      { word: 'با', termId: 1, df: 1, cf: 1, idf: 1 },
    ]);
    expect(tie.withPrefix('ب', 5)).toEqual(['با', 'بب']);
  });
});
