import { normalize } from '@quran/text-utils';
import { SURAS_FIXTURE } from '../../../test/support/suras.fixture';
import { MAX_NAME_WORDS, SURA_ALIASES, SuraCatalog } from './sura-catalog';

describe('SuraCatalog', () => {
  const catalog = SuraCatalog.build(SURAS_FIXTURE);

  it('builds from all 114 suras without name conflicts', () => {
    expect(catalog.size).toBe(114);
    const names = catalog.nameEntries();
    expect(new Set(names.map((n) => n.name)).size).toBe(names.length);
    expect(names.every((n) => n.name === normalize(n.name))).toBe(true);
    expect(names.every((n) => n.name.split(' ').length <= MAX_NAME_WORDS)).toBe(true);
  });

  it('canonical names are usable bare', () => {
    for (const s of SURAS_FIXTURE) {
      expect([s.number, catalog.lookupName(normalize(s.nameAr), false)]).toEqual([
        s.number,
        s.number,
      ]);
    }
  });

  it('article-less forms need a signal', () => {
    expect(catalog.lookupName('بقره', false)).toBeUndefined();
    expect(catalog.lookupName('بقره', true)).toBe(2);
    expect(catalog.lookupName('كهف', true)).toBe(18);
    expect(catalog.lookupName('اخلاص', true)).toBe(112);
  });

  it('aliases resolve with their declared use', () => {
    for (const a of SURA_ALIASES) {
      const key = normalize(a.name);
      expect([a.name, catalog.lookupName(key, true)]).toEqual([a.name, a.sura]);
      expect([a.name, catalog.lookupName(key, false)]).toEqual([
        a.name,
        a.use === 'bare' ? a.sura : undefined,
      ]);
    }
  });

  it('unknown names resolve to nothing', () => {
    expect(catalog.lookupName('الكمبيوتر', true)).toBeUndefined();
    expect(catalog.lookupName('', true)).toBeUndefined();
  });

  it('exposes sura info', () => {
    expect(catalog.get(2)).toEqual({ number: 2, nameAr: 'البقرة', ayahCount: 286 });
    expect(catalog.get(115)).toBeUndefined();
  });

  it('accepts matching corpus ayah counts', () => {
    const counts = new Map(SURAS_FIXTURE.map((s) => [s.number, s.ayahCount]));
    expect(SuraCatalog.build(SURAS_FIXTURE, counts).size).toBe(114);
    // 6236 ayahs in total, as in the database.
    expect([...counts.values()].reduce((a, b) => a + b, 0)).toBe(6236);
  });

  it('rejects counts that disagree with the index, either way', () => {
    const counts = new Map(SURAS_FIXTURE.map((s) => [s.number, s.ayahCount]));
    counts.set(2, 285);
    expect(() => SuraCatalog.build(SURAS_FIXTURE, counts)).toThrow(/sura\(s\) 2$/);
    const missing = new Map([[1, 7]]);
    expect(() =>
      SuraCatalog.build([{ number: 1, nameAr: 'الفاتحة', ayahCount: 7 }], missing),
    ).not.toThrow();
    expect(() =>
      SuraCatalog.build(
        [{ number: 1, nameAr: 'الفاتحة', ayahCount: 7 }],
        new Map([
          [1, 7],
          [2, 3],
        ]),
      ),
    ).toThrow(/sura\(s\) 2$/);
  });

  it.each([
    [[{ number: 0, nameAr: 'x', ayahCount: 1 }], /invalid or duplicate sura number 0/],
    [
      [
        { number: 1, nameAr: 'الفاتحة', ayahCount: 7 },
        { number: 1, nameAr: 'الفاتحة', ayahCount: 7 },
      ],
      /duplicate sura number 1/,
    ],
    [[{ number: 1.5, nameAr: 'x', ayahCount: 1 }], /invalid or duplicate/],
    [[{ number: 1, nameAr: 'الفاتحة', ayahCount: 0 }], /invalid ayah count 0/],
    [[{ number: 1, nameAr: '...', ayahCount: 7 }], /normalizes to nothing/],
    [
      [
        { number: 1, nameAr: 'الفاتحة', ayahCount: 7 },
        { number: 2, nameAr: 'الفاتحه', ayahCount: 7 },
      ],
      /maps to suras 1 and 2/,
    ],
    [[{ number: 1, nameAr: 'اسم من اربع كلمات', ayahCount: 7 }], /longer than 3 words/],
  ])('rejects bad rows (%#)', (rows, error) => {
    expect(() => SuraCatalog.build(rows)).toThrow(error);
  });

  it("skips an article-less form that is another sura's name", () => {
    // "الحج" -> "حج"; if a sura were literally named "حج", the canonical name wins.
    const c = SuraCatalog.build([
      { number: 1, nameAr: 'الحج', ayahCount: 1 },
      { number: 2, nameAr: 'حج', ayahCount: 1 },
    ]);
    expect(c.lookupName('حج', false)).toBe(2);
    expect(c.lookupName('الحج', false)).toBe(1);
  });

  it('only adds aliases for suras that exist', () => {
    const c = SuraCatalog.build([{ number: 1, nameAr: 'الفاتحة', ayahCount: 7 }]);
    expect(c.lookupName(normalize('فاتحة الكتاب'), false)).toBe(1);
    expect(c.lookupName('تبارك', true)).toBeUndefined();
  });

  it('an alias equal to a canonical name of the same sura keeps the more permissive use', () => {
    // Canonical "الدهر" (bare) + alias "الدهر" for 76 (signal): stays bare.
    const c = SuraCatalog.build([{ number: 76, nameAr: 'الدهر', ayahCount: 31 }]);
    expect(c.lookupName('الدهر', false)).toBe(76);
  });
});
