import { ServiceUnavailableException } from '@nestjs/common';
import type { CorpusAyah } from './index/corpus-loader.service';
import {
  buildSnapshot,
  type SearchIndexService,
  type SearchSnapshot,
} from './index/search-index.service';
import { MIN_RESULTS } from './ranking/stages';
import { CACHE_MAX_HITS, SUGGEST_LIMIT, SearchService } from './search.service';

const ayah = (ayahId: number, sura: number, n: number, textSimple: string): CorpusAyah => ({
  ayahId,
  suraNumber: sura,
  ayahNumber: n,
  textSimple,
  textUthmani: textSimple,
});

/** Snapshot whose sura catalog matches the corpus (sura names are placeholders). */
function snapshotOf(corpus: CorpusAyah[]): SearchSnapshot {
  const counts = new Map<number, number>();
  for (const d of corpus) counts.set(d.suraNumber, (counts.get(d.suraNumber) ?? 0) + 1);
  const names: Record<number, string> = {
    1: 'الفاتحة',
    2: 'البقرة',
    3: 'آل عمران',
    112: 'الإخلاص',
  };
  return buildSnapshot(
    corpus,
    [...counts].map(([number, ayahCount]) => ({ number, nameAr: names[number], ayahCount })),
  );
}

const service = (snap: SearchSnapshot | null) =>
  new SearchService({ currentSnapshot: () => snap } as unknown as SearchIndexService);

describe('SearchService: Phase 3 corrections (claude.md 5.5 / 5.6 stages 4 and 6)', () => {
  const svc = service(
    snapshotOf([
      ayah(1, 1, 1, 'بسم الله الرحمن الرحيم'),
      ayah(2, 1, 2, 'الحمد لله رب العالمين'),
      ayah(3, 1, 3, 'الرحمن الرحيم'),
      ayah(4, 2, 1, 'ذلك الكتاب لا ريب فيه'),
      ayah(5, 2, 2, 'كلمه بسماله'), // one edit from "بسمالله"
      ayah(6, 3, 1, 'يعملون الصالحات'),
      ayah(7, 3, 2, 'يعلمون الحق'),
      ayah(8, 112, 1, 'قل هو الله أحد'),
      ayah(9, 112, 2, 'الله الصمد'),
    ]),
  );
  const ranked = (q: string) =>
    svc.search(q, { limit: 100 }).results.map((r) => `${r.ref}/${r.matchType}/${r.confidence}`);

  it('corrects an OOV word and reports it (claude.md 5.7 example)', () => {
    const out = svc.search('الحمد لله رب العالمن');
    expect(out.corrected).toEqual({
      applied: true,
      text: 'الحمد لله رب العالمين',
      changes: [{ from: 'العالمن', to: 'العالمين', kind: 'edit1' }],
    });
    expect(out.didYouMean).toBeNull();
    expect(ranked('الحمد لله رب العالمن')).toEqual(['1:2/corrected/medium']);
    expect(out.results[0].matchedWords).toEqual([0, 1, 2, 3]);
    expect(out.results[0].highlights).toHaveLength(1);
  });

  it('reads each ayah with its own best candidate; one word cannot fill two slots', () => {
    expect(svc.search('الرحمن الرحم').corrected?.text).toBe('الرحمن الرحيم');
    // 1:3 (2 words) before 1:1 (4 words); never "الرحمن" counted twice.
    expect(ranked('الرحمن الرحم')).toEqual(['1:3/corrected/medium', '1:1/corrected/medium']);
  });

  it('splits glued words (step 6)', () => {
    expect(svc.search('قلهوالله احد').corrected).toEqual({
      applied: true,
      text: 'قل هو الله احد',
      changes: [{ from: 'قلهوالله', to: 'قل هو الله', kind: 'split' }],
    });
    expect(ranked('قلهوالله احد')).toEqual(['112:1/corrected/medium']);
  });

  it('falls back to a split when the single-word reading finds nothing', () => {
    // "بسمالله" is one edit from "بسماله" (2:2), but "بسماله الرحمن" matches no ayah.
    const out = svc.search('بسمالله الرحمن');
    expect(out.corrected?.changes).toEqual([{ from: 'بسمالله', to: 'بسم الله', kind: 'split' }]);
    expect(out.results.map((r) => r.ref)).toEqual(['1:1']);
  });

  it('merges a split-off article', () => {
    expect(svc.search('ال رحمن الرحيم').corrected?.changes).toEqual([
      { from: 'ال رحمن', to: 'الرحمن', kind: 'merge' },
    ]);
  });

  it('a skeleton-only correction is `loose` with low confidence (stage 6)', () => {
    expect(svc.search('ذاليك الكتاب').corrected?.changes).toEqual([
      { from: 'ذاليك', to: 'ذلك', kind: 'skeleton' },
    ]);
    expect(ranked('ذاليك الكتاب')).toEqual(['2:1/loose/low']);
  });

  it('rule 5.1: vocabulary words are never changed; "هل تقصد" is suggested instead', () => {
    const out = svc.search('يعلمون الصالحات'); // both words exist, no ayah has both
    expect(out).toMatchObject({ corrected: null, total: 0 });
    expect(out.didYouMean).toEqual(['يعملون الصالحات']);
    expect(svc.search('الصمد الكتاب').didYouMean).toBeNull(); // nothing close enough
  });

  it('"هل تقصد": cheapest change first, then the one with more ayahs; at most 3', () => {
    const s = service(
      snapshotOf([
        ayah(1, 2, 1, 'الصراط'),
        ayah(2, 2, 2, 'السراط الكبير'), // phonetic neighbour of الصراط (cost 0.5)
        ayah(3, 2, 3, 'الصراطي الكبير'), // one edit (cost 1)
        ayah(4, 2, 4, 'الصراطي الكبير'),
        ayah(5, 2, 5, 'الصراطا الكبير'), // one edit, fewer ayahs than الصراطي
      ]),
    );
    expect(s.search('الصراط الكبير').didYouMean).toEqual([
      'السراط الكبير',
      'الصراطي الكبير',
      'الصراطا الكبير',
    ]);
  });

  it('no correction when an OOV word has no candidate, or for references', () => {
    expect(svc.search('الله كمبيوتر')).toMatchObject({
      corrected: null,
      didYouMean: null,
      total: 0,
    });
    const ref = svc.search('الإخلاص 9');
    expect(ref.reference).toMatchObject({ status: 'invalid' });
    expect(ref).toMatchObject({ corrected: null, didYouMean: null, total: 0 });
  });

  it('phrase queries are untouched by Phase 3', () => {
    expect(svc.search('الله الصمد')).toMatchObject({ corrected: null, didYouMean: null });
    expect(ranked('الله الصمد')).toEqual(['112:2/phrase/high']);
  });

  it('corrected results stop the loose stage once MIN_RESULTS are gathered', () => {
    const corpus = [
      ...Array.from({ length: MIN_RESULTS }, (_, i) => ayah(i + 1, 3, i + 1, 'الكتاب المبين')),
      ayah(MIN_RESULTS + 1, 3, MIN_RESULTS + 1, 'الكاتب'),
    ];
    const out = service(snapshotOf(corpus)).search('الكتابب', { limit: 100 });
    expect(out.total).toBe(MIN_RESULTS);
    expect(out.results.every((r) => r.matchType === 'corrected')).toBe(true);
  });
});

describe('SearchService: result cache (claude.md 5.11)', () => {
  const corpus = [ayah(1, 112, 1, 'قل هو الله أحد'), ayah(2, 112, 2, 'الله الصمد')];

  it('serves repeated queries from the cache, keyed on normalized text + reference parse', () => {
    const svc = service(snapshotOf(corpus));
    svc.search('الله');
    svc.search('اللَّه'); // same normalized query -> cache hit
    expect(svc.cacheStats()).toEqual({ size: 1, hits: 1, misses: 1 });
    // "112:2" and "112 2" normalize alike but parse differently: separate entries.
    expect(svc.search('112:2').results.map((r) => r.ref)).toEqual(['112:2']);
    expect(svc.search('112 2').results).toEqual([]);
    expect(svc.cacheStats().size).toBe(3);
    // Paging is applied after the cache.
    expect(svc.search('الله', { page: 2, limit: 1 }).results).toHaveLength(1);
  });

  it('is emptied when the index snapshot changes (reindex)', () => {
    let snap = snapshotOf(corpus);
    const svc = new SearchService({ currentSnapshot: () => snap } as unknown as SearchIndexService);
    expect(svc.search('الله').total).toBe(2);
    expect(svc.cacheStats().size).toBe(1);
    snap = snapshotOf([ayah(1, 112, 1, 'الله الصمد')]);
    expect(svc.search('الله').total).toBe(1); // the new index's answer, not the cached one
    expect(svc.cacheStats()).toMatchObject({ size: 1, hits: 0 });
  });

  it('does not keep result lists longer than CACHE_MAX_HITS', () => {
    const big = Array.from({ length: CACHE_MAX_HITS + 1 }, (_, i) => ayah(i + 1, 2, i + 1, 'الله'));
    const svc = service(snapshotOf(big));
    expect(svc.search('الله').total).toBe(CACHE_MAX_HITS + 1);
    expect(svc.cacheStats().size).toBe(0);
  });
});

describe('SearchService.suggest (claude.md 5.11)', () => {
  const svc = service(
    snapshotOf([
      ayah(1, 1, 1, 'بسم الله الرحمن الرحيم'),
      ayah(2, 1, 2, 'الرحمن الرحيم الرحمن'),
      ayah(3, 112, 1, 'قل هو الله أحد'),
      ayah(4, 112, 2, 'الله الصمد'),
    ]),
  );

  it('completes the last word by prefix, most frequent first, keeping the head', () => {
    expect(svc.suggest('قل هو الر')).toEqual({
      query: { raw: 'قل هو الر', normalized: 'قل هو الر' },
      suggestions: [
        { text: 'قل هو الرحمن', word: 'الرحمن', kind: 'prefix' },
        { text: 'قل هو الرحيم', word: 'الرحيم', kind: 'prefix' },
      ],
    });
  });

  it('marks the word itself as exact', () => {
    expect(svc.suggest('الله').suggestions).toEqual([
      { text: 'الله', word: 'الله', kind: 'exact' },
    ]);
  });

  it('falls back to corrections for an OOV last word', () => {
    expect(svc.suggest('الرحنم').suggestions.map((s) => [s.word, s.kind])).toEqual([
      ['الرحمن', 'edit1'],
      ['الرحيم', 'edit1'], // one substitution ن->ي
    ]);
  });

  it('caps at SUGGEST_LIMIT and returns none for empty or unknown input', () => {
    const many = service(snapshotOf([ayah(1, 2, 1, 'ابا ابب ابت ابث ابج ابح ابخ')]));
    expect(many.suggest('اب').suggestions).toHaveLength(SUGGEST_LIMIT);
    expect(svc.suggest('hello').suggestions).toEqual([]);
    expect(svc.suggest('ثثثث').suggestions).toEqual([]);
  });

  it('503 before the index is ready', () => {
    expect(() => service(null).suggest('الله')).toThrow(ServiceUnavailableException);
  });
});
