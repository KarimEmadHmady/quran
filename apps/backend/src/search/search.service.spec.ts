import { ServiceUnavailableException } from '@nestjs/common';
import { createEngineSearch } from './golden/engine-search';
import type { CorpusAyah } from './index/corpus-loader.service';
import {
  buildSnapshot,
  type SearchIndexService,
  type SearchSnapshot,
} from './index/search-index.service';
import { MIN_RESULTS } from './ranking/stages';
import { SearchService } from './search.service';

const ayah = (
  ayahId: number,
  sura: number,
  n: number,
  textSimple: string,
  textUthmani = textSimple,
): CorpusAyah => ({ ayahId, suraNumber: sura, ayahNumber: n, textSimple, textUthmani });

const NAMES: Record<number, string> = {
  1: 'الفاتحة',
  2: 'البقرة',
  3: 'آل عمران',
  36: 'يس',
  55: 'الرحمن',
  112: 'الإخلاص',
};

/** Snapshot whose sura catalog matches the corpus exactly (complete suras). */
function snapshotOf(corpus: CorpusAyah[]): SearchSnapshot {
  const counts = new Map<number, number>();
  for (const d of corpus) counts.set(d.suraNumber, (counts.get(d.suraNumber) ?? 0) + 1);
  const suras = [...counts].map(([number, ayahCount]) => ({
    number,
    nameAr: NAMES[number],
    ayahCount,
  }));
  return buildSnapshot(corpus, suras);
}

const service = (snap: SearchSnapshot | null) =>
  new SearchService({ currentSnapshot: () => snap } as unknown as SearchIndexService);

const FILLER = 'كان في ذلك اليوم امر عظيم جدا لمن كان يعقل';

// A miniature corpus chosen to exercise every stage and the reference / text interplay.
const CORPUS: CorpusAyah[] = [
  ayah(1, 1, 1, 'بسم الله الرحمن الرحيم', 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ'),
  ayah(2, 1, 2, 'الحمد لله رب العالمين', 'ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَٰلَمِينَ'),
  ayah(3, 2, 1, 'الله نور السماوات الأرض'), // ordered for "الله نور الأرض" (span 4)
  ayah(4, 2, 2, 'الأرض نور الله'), // all_terms (reverse order)
  ayah(5, 2, 3, `الله ${FILLER} نور الأرض`), // in order but spread too wide -> all_terms
  ayah(6, 36, 1, 'يس', 'يسٓ'),
  ayah(7, 36, 2, 'والقرآن الحكيم', 'وَٱلْقُرْءَانِ ٱلْحَكِيمِ'),
  ayah(8, 55, 1, 'الرحمن', 'ٱلرَّحْمَٰنُ'),
  ayah(9, 55, 2, 'علم القرآن', 'عَلَّمَ ٱلْقُرْءَانَ'),
  ayah(10, 112, 1, 'قل هو الله أحد', 'قُلْ هُوَ ٱللَّهُ أَحَدٌ'),
  ayah(11, 112, 2, 'الله الصمد', 'ٱللَّهُ ٱلصَّمَدُ'),
];

describe('SearchService', () => {
  const svc = service(snapshotOf(CORPUS));
  const ranked = (q: string) =>
    svc.search(q, { limit: 100 }).results.map((r) => `${r.ref}/${r.matchType}`);

  it('throws 503 (ServiceUnavailable) before the index is ready', () => {
    expect(() => service(null).search('2:255')).toThrow(ServiceUnavailableException);
  });

  describe('stage 0: references', () => {
    it('numeric reference -> that ayah, full display fields, no highlight', () => {
      const out = svc.search('١١٢:٢');
      expect(out.reference).toEqual({
        status: 'ok',
        ref: { kind: 'ayah', sura: 112, ayah: 2 },
        ambiguous: false,
      });
      expect(out.total).toBe(1);
      expect(out.results).toEqual([
        {
          ayahId: 11,
          suraNumber: 112,
          suraName: 'الإخلاص',
          ayahNumber: 2,
          ref: '112:2',
          textUthmani: 'ٱللَّهُ ٱلصَّمَدُ',
          matchType: 'reference',
          score: 230, // no query word is a corpus word: 200 + 0 idf + 30
          confidence: 'high',
          matchedWords: [],
          highlights: [],
        },
      ]);
    });

    it('name + ayah, and explicit sura-only references', () => {
      expect(ranked('الإخلاص 1')).toEqual(['112:1/reference']);
      expect(ranked('سورة الفاتحة آية ٢')).toEqual(['1:2/reference']);
      const out = svc.search('سورة الرحمن');
      expect(out.reference).toMatchObject({
        ref: { kind: 'sura', explicit: true },
        ambiguous: false,
      });
      expect(out.results.map((r) => [r.ref, r.confidence])).toEqual([['55:1', 'high']]);
    });

    it('a bare sura name that is also Quran text: reference first, then the text matches', () => {
      const out = svc.search('الرحمن');
      expect(out.reference).toMatchObject({ ref: { kind: 'sura', sura: 55 }, ambiguous: true });
      expect(ranked('الرحمن')).toEqual(['55:1/reference', '1:1/phrase']);
      expect(out.results[0]).toMatchObject({
        confidence: 'medium',
        matchedWords: [0], // 55:1 also matched as text: highlighted, not duplicated
        highlights: [{ start: 0, end: 'ٱلرَّحْمَٰنُ'.length }],
      });
    });

    it('"يس" is the sura name and the whole of 36:1: one result', () => {
      expect(ranked('يس')).toEqual(['36:1/reference']);
    });

    it('a bare sura name that is not Quran text is not ambiguous', () => {
      const out = svc.search('الفاتحة');
      expect(out.reference).toMatchObject({ ambiguous: false });
      expect(out.results.map((r) => [r.ref, r.confidence])).toEqual([['1:1', 'high']]);
    });

    it('invalid references are reported, with no results', () => {
      const out = svc.search('الإخلاص 3');
      expect(out.reference).toEqual({
        status: 'invalid',
        reason: 'ayah_out_of_range',
        sura: 112,
        ayah: 3,
        ayahCount: 2,
        ambiguous: false,
      });
      expect(out.results).toEqual([]);
    });
  });

  describe('stages 1-3: text', () => {
    it('phrase: shorter ayahs rank first (length penalty), ties in mushaf order', () => {
      // "الله" in 1:1 (4 words), 2:1 (4), 2:2 (3), 2:3 (16), 112:1 (4), 112:2 (2)
      expect(ranked('الله')).toEqual([
        '112:2/phrase',
        '2:2/phrase',
        '1:1/phrase',
        '2:1/phrase',
        '112:1/phrase',
        '2:3/phrase',
      ]);
      const out = svc.search('الله');
      expect(out.reference).toBeNull();
      expect(out.results[0].highlights).toEqual([{ start: 0, end: 'ٱللَّهُ'.length }]);
    });

    it('a multi-word phrase highlights every matched word', () => {
      const out = svc.search('قل هو الله احد');
      expect(out.results.map((r) => [r.ref, r.matchType, r.confidence])).toEqual([
        ['112:1', 'phrase', 'high'],
      ]);
      expect(out.results[0].matchedWords).toEqual([0, 1, 2, 3]);
    });

    it('ordered (window) beats all_terms; all_terms ranks the tighter, shorter ayah first', () => {
      expect(ranked('الله نور الأرض')).toEqual(['2:1/ordered', '2:2/all_terms', '2:3/all_terms']);
      const [o, a1, a2] = svc.search('الله نور الأرض').results;
      expect(o).toMatchObject({ confidence: 'high', matchedWords: [0, 1, 3] });
      expect(a1).toMatchObject({ confidence: 'medium', matchedWords: [0, 1, 2] });
      expect(a2.matchedWords).toEqual([0, 11, 12]);
      expect(o.score).toBeGreaterThan(a1.score);
      expect(a1.score).toBeGreaterThan(a2.score);
    });

    it('phrase results always come before ordered / all_terms results', () => {
      expect(ranked('نور الأرض')).toEqual(['2:3/phrase', '2:1/ordered', '2:2/all_terms']);
    });

    it('a word missing from the corpus: no stage 1-3 match, only low-confidence partial (stage 5)', () => {
      expect(ranked('الله نور القمر')).toEqual(['2:2/partial', '2:1/partial', '2:3/partial']);
      expect(svc.search('الله نور القمر').results.every((r) => r.confidence === 'low')).toBe(true);
    });

    it('repeated query words need repeated occurrences', () => {
      const corpus = [
        ayah(1, 3, 1, 'كلا كلا كلا'),
        ayah(2, 3, 2, 'كلا سوف تعلمون'),
        ayah(3, 3, 3, 'كلا ثم كلا'),
      ];
      const s = service(snapshotOf(corpus));
      const out = s.search('كلا كلا');
      expect(out.results.map((r) => `${r.ref}/${r.matchType}`)).toEqual([
        '3:1/phrase',
        '3:3/ordered',
      ]);
      // overlapping occurrences share words: deduped
      expect(out.results[0].matchedWords).toEqual([0, 1, 2]);
    });

    it(`stops after a stage that reaches ${MIN_RESULTS} results`, () => {
      const corpus = [
        ...Array.from({ length: MIN_RESULTS }, (_, i) => ayah(i + 1, 3, i + 1, 'قل هو الحق')),
        ayah(MIN_RESULTS + 1, 3, MIN_RESULTS + 1, 'هو قل'),
      ];
      const s = service(snapshotOf(corpus));
      const out = s.search('قل هو', { limit: 100 });
      expect(out.total).toBe(MIN_RESULTS);
      expect(out.results.every((r) => r.matchType === 'phrase')).toBe(true);
      // ...but below the threshold the weaker stage still runs
      expect(s.search('هو قل', { limit: 100 }).results.map((r) => r.matchType)).toEqual([
        'phrase',
        ...Array<string>(MIN_RESULTS).fill('all_terms'),
      ]);
    });

    it(`also stops after the ordered stage once ${MIN_RESULTS} results are gathered`, () => {
      const corpus = [
        ...Array.from({ length: MIN_RESULTS }, (_, i) => ayah(i + 1, 3, i + 1, 'قل ثم هو')),
        ayah(MIN_RESULTS + 1, 3, MIN_RESULTS + 1, 'هو ثم قل'),
      ];
      const out = service(snapshotOf(corpus)).search('قل هو', { limit: 100 });
      expect(out.total).toBe(MIN_RESULTS);
      expect(out.results.every((r) => r.matchType === 'ordered')).toBe(true);
    });

    it('queries that normalize to nothing return nothing', () => {
      expect(svc.search('hello')).toEqual({
        query: { raw: 'hello', normalized: '' },
        corrected: null,
        didYouMean: null,
        reference: null,
        total: 0,
        page: 1,
        limit: 50,
        totalPages: 0,
        results: [],
      });
    });
  });

  it('pages the ranked list (highlights only for the returned page)', () => {
    const all = ranked('الله');
    const p2 = svc.search('الله', { page: 2, limit: 4 });
    expect(p2).toMatchObject({ total: 6, page: 2, limit: 4, totalPages: 2 });
    expect(p2.results.map((r) => `${r.ref}/${r.matchType}`)).toEqual(all.slice(4));
    expect(svc.search('الله', { page: 3, limit: 4 }).results).toEqual([]);
  });

  it('echoes the raw and normalized query', () => {
    expect(svc.search('إِيَّاكَ').query).toEqual({ raw: 'إِيَّاكَ', normalized: 'اياك' });
  });

  it('falls back to an empty sura name if the catalog lacks the sura', () => {
    const snap = snapshotOf(CORPUS);
    const suras = Object.assign(Object.create(snap.suras) as SearchSnapshot['suras'], {
      get: () => undefined,
    });
    const s = service({ ...snap, suras });
    expect(s.search('الصمد').results[0].suraName).toBe('');
  });

  it('createEngineSearch() adapts it for the golden scorer', async () => {
    await expect(createEngineSearch(svc)('الرحمن', 'text')).resolves.toEqual([
      { ref: '55:1', confidence: 'medium' },
      { ref: '1:1', confidence: 'high' },
    ]);
  });
});
