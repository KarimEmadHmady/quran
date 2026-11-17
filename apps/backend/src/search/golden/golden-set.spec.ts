import { GOLDEN_CATEGORIES, parseRef, validateGoldenSet } from './golden-set';
import { loadGoldenSet } from './load-golden';

const good = {
  id: 'phrase-01',
  q: 'x',
  category: 'phrase',
  tier: 'clean',
  expected: ['1:1'],
};

describe('parseRef', () => {
  it.each([
    ['1:1', { sura: 1, ayah: 1 }],
    ['2:255', { sura: 2, ayah: 255 }],
    ['114:6', { sura: 114, ayah: 6 }],
  ])('parses %p', (ref, out) => expect(parseRef(ref)).toEqual(out));

  it.each(['0:1', '1:0', '115:1', '1-1', ' 1:1', '1:1 ', '01:1', 'a:b', ''])('rejects %p', (ref) =>
    expect(parseRef(ref)).toBeNull(),
  );
});

describe('validateGoldenSet', () => {
  it('accepts a valid set and defaults type to text', () => {
    expect(validateGoldenSet({ cases: [good] })).toEqual([{ ...good, type: 'text' }]);
    expect(validateGoldenSet({ cases: [{ ...good, type: 'voice', note: 'n' }] })[0].type).toBe(
      'voice',
    );
  });

  it('rejects a non-object or a missing cases array', () => {
    expect(() => validateGoldenSet(null)).toThrow(/cases/);
    expect(() => validateGoldenSet({ cases: 'x' })).toThrow(/cases/);
  });

  it.each([
    ['not an object', 5, /not an object/],
    ['bad id', { ...good, id: 'Phrase 1' }, /bad id/],
    ['blank q', { ...good, q: '  ' }, /q must be/],
    ['long q', { ...good, q: 'x'.repeat(201) }, /q must be/],
    ['bad type', { ...good, type: 'audio' }, /type must be/],
    ['bad category', { ...good, category: 'misc' }, /unknown category/],
    ['bad tier', { ...good, tier: 'gold' }, /unknown tier/],
    ['bad note', { ...good, note: 1 }, /note must be/],
    ['expected not array', { ...good, expected: '1:1' }, /expected must be/],
    ['invalid ref', { ...good, expected: ['115:1'] }, /invalid refs 115:1/],
    ['duplicate refs', { ...good, expected: ['1:1', '1:1'] }, /duplicate refs/],
    ['empty positive', { ...good, expected: [] }, /must not be empty/],
    ['non-empty negative', { ...good, category: 'negative' }, /negative cases expect/],
    ['typo case without intended', { ...good, tier: 'typo' }, /typo-tier cases need "intended"/],
    ['voice case without intended', { ...good, tier: 'voice' }, /voice-tier cases need "intended"/],
    ['blank intended', { ...good, intended: ' ' }, /intended must be/],
    ['non-string intended', { ...good, intended: 3 }, /intended must be/],
  ])('rejects %s', (_label, c, message) => {
    expect(() => validateGoldenSet({ cases: [c] })).toThrow(message);
  });

  it('rejects duplicate ids and reports every problem at once', () => {
    let message = '';
    try {
      validateGoldenSet({ cases: [good, good, { ...good, id: 'x-01', tier: 'nope', q: '' }] });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/duplicate id/);
    expect(message).toMatch(/unknown tier/);
    expect(message).toMatch(/q must be/);
  });
});

describe('golden-queries.json (the committed file)', () => {
  const cases = loadGoldenSet();

  it('is valid and has at least 50 cases', () => {
    expect(cases.length).toBeGreaterThanOrEqual(50);
  });

  it('covers every Phase 2 (clean) category, including negatives', () => {
    const used = new Set(cases.map((c) => c.category));
    for (const c of [
      'reference',
      'phrase',
      'hamza_diacritics',
      'teh_alef_variants',
      'stopwords',
      'partial',
      'word_order',
      'negative',
    ] as const) {
      expect(used.has(c)).toBe(true);
    }
    expect(cases.every((c) => GOLDEN_CATEGORIES.includes(c.category))).toBe(true);
  });

  it('includes Ayat al-Kursi and Al-Fatiha', () => {
    const all = cases.flatMap((c) => c.expected);
    expect(all).toContain('2:255');
    expect(all).toEqual(expect.arrayContaining(['1:1', '1:2', '1:5', '1:6', '1:7']));
  });
});
