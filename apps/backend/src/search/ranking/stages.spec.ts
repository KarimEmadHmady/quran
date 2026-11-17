import { STAGE_WEIGHT, anyOrderWindow, orderedWindow, referenceScore, scoreMatch } from './stages';

describe('orderedWindow', () => {
  it('finds the smallest in-order window', () => {
    // words: a b x a b  -> query "a b": [3,4] beats [0,1]? both span 2; first wins
    expect(
      orderedWindow([
        [0, 3],
        [1, 4],
      ]),
    ).toEqual({ span: 2, words: [0, 1] });
    // a x x b a b -> best is [4,5]
    expect(
      orderedWindow([
        [0, 4],
        [3, 5],
      ]),
    ).toEqual({ span: 2, words: [4, 5] });
  });

  it('needs strictly increasing positions (repeated words use distinct occurrences)', () => {
    expect(orderedWindow([[2], [2]])).toBeNull();
    expect(
      orderedWindow([
        [0, 2],
        [0, 2],
      ]),
    ).toEqual({ span: 3, words: [0, 2] });
  });

  it('returns null when the order cannot be satisfied or a word is missing', () => {
    expect(orderedWindow([[5], [1]])).toBeNull(); // b only before a
    expect(orderedWindow([[0], []])).toBeNull();
    expect(orderedWindow([])).toBeNull();
  });

  it('single word: span 1', () => {
    expect(orderedWindow([[7, 9]])).toEqual({ span: 1, words: [7] });
  });
});

describe('anyOrderWindow', () => {
  it('finds the smallest window holding every word, in any order', () => {
    // b(1) a(2) ... a(10) b(12)
    expect(
      anyOrderWindow(
        [
          [2, 10],
          [1, 12],
        ],
        [1, 1],
      ),
    ).toEqual({ span: 2, words: [1, 2] });
  });

  it('honours required multiplicity', () => {
    // a at 0, 5, 6; b at 4 -> need a twice + b: window [4..6]
    expect(anyOrderWindow([[0, 5, 6], [4]], [2, 1])).toEqual({ span: 3, words: [4, 5, 6] });
  });

  it('returns null when a word is missing or too rare', () => {
    expect(anyOrderWindow([[1], []], [1, 1])).toBeNull();
    expect(anyOrderWindow([[1]], [2])).toBeNull();
    expect(anyOrderWindow([], [])).toBeNull();
  });
});

describe('scoreMatch', () => {
  const base = { idfSum: 5, queryLength: 3, docLength: 3, span: 3, coverage: 1 };

  it('adjacent words in an ayah of the query length: weight + idf + 10 + 20', () => {
    expect(scoreMatch({ ...base, stage: 'phrase' })).toBe(100 + 5 + 10 + 20);
    expect(scoreMatch({ ...base, stage: 'ordered' })).toBe(80 + 35);
    expect(scoreMatch({ ...base, stage: 'all_terms' })).toBe(60 + 35);
  });

  it('a wider window lowers the proximity bonus', () => {
    expect(scoreMatch({ ...base, stage: 'ordered', span: 6 })).toBe(80 + 5 + 5 + 20);
  });

  it('a longer ayah loses a little, capped at 10', () => {
    const s = (docLength: number) => scoreMatch({ ...base, stage: 'phrase', docLength });
    expect(s(3 * Math.E)).toBeCloseTo(135 - 2, 2);
    expect(s(100_000)).toBe(125);
    expect(s(2)).toBe(135); // shorter than the query: no penalty
  });

  it('a stage never overtakes the one above it', () => {
    const worstPhrase = scoreMatch({ ...base, stage: 'phrase', docLength: 1e6 });
    const bestOrdered = scoreMatch({ ...base, stage: 'ordered', idfSum: 5 });
    expect(worstPhrase).toBeGreaterThan(bestOrdered);
    expect(referenceScore(5)).toBeGreaterThan(
      scoreMatch({ ...base, stage: 'phrase', docLength: 1 }),
    );
    expect(STAGE_WEIGHT.reference).toBeGreaterThan(STAGE_WEIGHT.phrase);
  });

  it('guards against zero lengths', () => {
    expect(scoreMatch({ ...base, stage: 'phrase', queryLength: 0, span: 0, docLength: 0 })).toBe(
      100 + 5 + 0 + 20,
    );
  });
});
