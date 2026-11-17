import type { GoldenCase } from './golden-set';
import {
  dedupeRanked,
  evaluateGolden,
  formatReport,
  recallAtK,
  reciprocalRank,
  type SearchHit,
} from './metrics';

const kase = (over: Partial<GoldenCase>): GoldenCase => ({
  id: 'phrase-01',
  q: 'q',
  type: 'text',
  category: 'phrase',
  tier: 'clean',
  expected: ['1:1'],
  ...over,
});

describe('recallAtK', () => {
  it('is hit@k for a single expected ref', () => {
    expect(recallAtK(['1:1'], ['1:1', '1:2'], 1)).toBe(1);
    expect(recallAtK(['1:1'], ['1:2', '1:1'], 1)).toBe(0);
    expect(recallAtK(['1:1'], ['1:2', '1:1'], 5)).toBe(1);
    expect(recallAtK(['1:1'], [], 5)).toBe(0);
  });

  it('divides by min(|expected|, k) for multi-answer cases', () => {
    const many = ['55:13', '55:16', '55:18', '55:21', '55:23', '55:25', '55:28'];
    expect(recallAtK(many, many.slice(0, 5), 5)).toBe(1);
    expect(recallAtK(many, ['55:13', 'x', '55:16', 'y', 'z'], 5)).toBe(0.4);
    expect(recallAtK(['1:1', '1:2'], ['1:2', '9:9', '1:1'], 5)).toBe(1);
  });

  it('ignores duplicate refs in the ranking', () => {
    expect(recallAtK(['1:1', '1:2'], ['1:1', '1:1', '1:2'], 2)).toBe(1);
  });

  it('throws for an empty expected set', () => {
    expect(() => recallAtK([], ['1:1'], 1)).toThrow();
  });
});

describe('reciprocalRank / dedupeRanked', () => {
  it('uses the first relevant result', () => {
    expect(reciprocalRank(['1:1'], ['1:1'])).toBe(1);
    expect(reciprocalRank(['1:1', '1:7'], ['x', 'y', '1:7', '1:1'])).toBeCloseTo(1 / 3);
    expect(reciprocalRank(['1:1'], ['x'])).toBe(0);
    expect(reciprocalRank(['1:2'], ['1:1', '1:1', '1:2'])).toBe(0.5);
  });

  it('keeps first occurrences in order', () => {
    expect(dedupeRanked(['a', 'b', 'a', 'c', 'b'])).toEqual(['a', 'b', 'c']);
  });
});

describe('evaluateGolden', () => {
  const answers: Record<string, SearchHit[]> = {
    hit: [{ ref: '1:1' }],
    second: [{ ref: '9:9' }, { ref: '1:1' }],
    miss: [{ ref: '9:9' }],
    'neg-low': [{ ref: '9:9', confidence: 'low' }],
    'neg-high': [{ ref: '9:9', confidence: 'high' }],
    'neg-none': [],
  };
  const search = (q: string) => Promise.resolve(answers[q] ?? []);
  const cases = [
    kase({ id: 'phrase-01', q: 'hit' }),
    kase({ id: 'phrase-02', q: 'second' }),
    kase({ id: 'reference-01', q: 'miss', category: 'reference', tier: 'typo' }),
    kase({ id: 'negative-01', q: 'neg-low', category: 'negative', expected: [] }),
    kase({ id: 'negative-02', q: 'neg-high', category: 'negative', expected: [] }),
    kase({ id: 'negative-03', q: 'neg-none', category: 'negative', expected: [] }),
  ];

  it('computes overall, per-category, per-tier metrics and negative failures', async () => {
    const report = await evaluateGolden(cases, search);
    expect(report.overall).toEqual({ cases: 3, recallAt: { 1: 1 / 3, 5: 2 / 3 }, mrr: 0.5 });
    expect(report.byCategory.phrase).toEqual({ cases: 2, recallAt: { 1: 0.5, 5: 1 }, mrr: 0.75 });
    expect(report.byCategory.reference.recallAt[5]).toBe(0);
    expect(report.byTier.clean.cases).toBe(2);
    expect(report.byTier.typo.cases).toBe(1);
    expect(report.negatives).toEqual({ cases: 3, confidentFalsePositives: 1 });
    expect(report.results.find((r) => r.id === 'phrase-02')?.top).toEqual(['9:9', '1:1']);
  });

  it('passes the query type through and supports custom k values', async () => {
    const spy = jest.fn().mockResolvedValue([{ ref: '1:1' }]);
    const report = await evaluateGolden([kase({ type: 'voice' })], spy, [1, 3, 10]);
    expect(spy).toHaveBeenCalledWith('q', 'voice');
    expect(Object.keys(report.overall.recallAt)).toEqual(['1', '3', '10']);
  });

  it('handles a set with no positive cases', async () => {
    const report = await evaluateGolden([cases[5]], search);
    expect(report.overall).toEqual({ cases: 0, recallAt: { 1: 0, 5: 0 }, mrr: 0 });
  });

  it('formats an ASCII report listing imperfect cases', async () => {
    const text = formatReport(await evaluateGolden(cases, search), 'Test');
    expect(text).toContain('== Test ==');
    expect(text).toMatch(/OVERALL\s+3\s+33\.3%\s+66\.7%\s+50\.0%/);
    expect(text).toContain('negatives: 3 cases, 1 confident false positives');
    expect(text).toContain('not perfect at R@5: reference-01, negative-02');
    expect(text).toMatch(/^[\x20-\x7e\n]*$/);
  });

  it('reports "none" when everything is perfect', async () => {
    const text = formatReport(await evaluateGolden([cases[0]], search));
    expect(text).toContain('not perfect at R@5: none');
  });
});
