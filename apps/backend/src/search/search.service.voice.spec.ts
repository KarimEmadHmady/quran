import type { CorpusAyah } from './index/corpus-loader.service';
import {
  buildSnapshot,
  type SearchIndexService,
  type SearchSnapshot,
} from './index/search-index.service';
import { ALT_PENALTY, SearchService } from './search.service';

const ayah = (ayahId: number, sura: number, n: number, textSimple: string): CorpusAyah => ({
  ayahId,
  suraNumber: sura,
  ayahNumber: n,
  textSimple,
  textUthmani: textSimple,
});

function snapshotOf(corpus: CorpusAyah[]): SearchSnapshot {
  const counts = new Map<number, number>();
  for (const d of corpus) counts.set(d.suraNumber, (counts.get(d.suraNumber) ?? 0) + 1);
  const names: Record<number, string> = { 1: 'الفاتحة', 2: 'البقرة', 112: 'الإخلاص' };
  return buildSnapshot(
    corpus,
    [...counts].map(([number, ayahCount]) => ({ number, nameAr: names[number], ayahCount })),
  );
}

const svc = new SearchService({
  currentSnapshot: (() => {
    const snap = snapshotOf([
      ayah(1, 1, 1, 'الرحمن الرحيم'),
      ayah(2, 1, 2, 'ال فرعون'), // makes "ال" a vocabulary word (as "آل" in the real corpus)
      ayah(3, 1, 3, 'رحمن عظيم'), // makes "رحمن" a vocabulary word
      ayah(4, 2, 1, 'الله الصمد'),
      ayah(5, 112, 1, 'قل هو الله أحد'),
      ayah(6, 112, 2, 'لم يلد ولم يولد'),
    ]);
    return () => snap;
  })(),
} as unknown as SearchIndexService);

const refs = (q: string, opts: Parameters<SearchService['search']>[1] = {}) =>
  svc
    .search(q, { limit: 50, ...opts })
    .results.map((r) => `${r.ref}/${r.matchType}/${r.confidence}`);

describe('SearchService: voice (claude.md 5.7 / 5.10)', () => {
  it('merges two vocabulary words that STT split ("ال رحمن"), only for voice', () => {
    const voice = svc.search('ال رحمن الرحيم', { type: 'voice' });
    expect(voice.corrected?.changes).toEqual([{ from: 'ال رحمن', to: 'الرحمن', kind: 'merge' }]);
    expect(voice.results[0]).toMatchObject({ ref: '1:1', matchType: 'corrected' });
    // text keeps every vocabulary word as typed (rule 5.1): no merge
    expect(svc.search('ال رحمن الرحيم').corrected).toBeNull();
  });

  it('completes a cut-off last word (5.5 step 2), only for voice', () => {
    const out = svc.search('الرحمن الرحي', { type: 'voice' });
    expect(out.corrected?.changes).toEqual([{ from: 'الرحي', to: 'الرحيم', kind: 'prefix' }]);
    expect(refs('الرحمن الرحي', { type: 'voice' })[0]).toBe('1:1/corrected/medium');
  });

  it('reports the transcripts it used', () => {
    const out = svc.search('الله الصمد', { type: 'voice', alts: ['اللة الصمت'] });
    expect(out.query).toEqual({
      raw: 'الله الصمد',
      normalized: 'الله الصمد',
      alternatives: ['الله الصمت'],
      selected: 'الله الصمد',
    });
    expect(svc.search('الله', { type: 'text' }).query).toEqual({ raw: 'الله', normalized: 'الله' });
  });

  it('searches every alternative and keeps the stage order (an alt can win)', () => {
    // q matches nothing; the second transcript is the real ayah.
    const out = svc.search('كلام غير مفهوم ابدا', {
      type: 'voice',
      alts: ['قل هو الله احد'],
    });
    expect(out.query.selected).toBe('قل هو الله احد');
    expect(out.results[0]).toMatchObject({ ref: '112:1', matchType: 'phrase', confidence: 'high' });
  });

  it('merged hits: the best stage per ayah wins; later alternatives pay ALT_PENALTY', () => {
    const a = svc.search('الله', { type: 'voice', alts: ['الله الصمد'] });
    // 2:1 is a phrase match for both transcripts. The alternative's 2-word phrase scores
    // higher even after ALT_PENALTY, so its hit is kept.
    const hit = a.results.find((r) => r.ref === '2:1');
    const fromQ = svc.search('الله').results.find((r) => r.ref === '2:1')!;
    const fromAlt = svc.search('الله الصمد').results.find((r) => r.ref === '2:1')!;
    expect(fromAlt.score - ALT_PENALTY).toBeGreaterThan(fromQ.score);
    expect(hit).toMatchObject({ matchType: 'phrase', score: fromAlt.score });
    // An ayah only the alternative finds still appears.
    const b = svc.search('ولم يولد', { type: 'voice', alts: ['قل هو'] });
    expect(b.results.map((r) => r.ref)).toEqual(['112:2', '112:1']);
  });

  it('alts are ignored for text searches', () => {
    expect(svc.search('الله الصمد', { alts: ['قل هو'] }).results.map((r) => r.ref)).toEqual([
      '2:1',
    ]);
  });
});

describe('SearchService: stage 5 partial (claude.md 5.6, >= 60% of the words)', () => {
  it('an extra / misheard word: the ayah is still found, with low confidence', () => {
    // 4 of 5 words of 112:1 found (80%)
    expect(refs('قل هو الله احد كبير')).toEqual(['112:1/partial/low']);
    expect(svc.search('قل هو الله احد كبير').results[0].matchedWords).toEqual([0, 1, 2, 3]);
  });

  it('below 60% coverage, or fewer than 3 words: no partial match', () => {
    expect(refs('قل كبير جدا عظيم كثير')).toEqual([]); // 1 of 5
    expect(refs('قل كبير')).toEqual([]); // 2 words: that is all_terms, not partial
  });

  it('a repeated query word must be repeated in the ayah', () => {
    // "ولم" twice + "يلد": 112:2 has "ولم" once -> only 2 of 4 slots (50%)
    expect(refs('ولم ولم يلد صدق')).toEqual([]);
    // "لم يلد ولم ..." 3 of 4 (75%)
    expect(refs('لم يلد ولم صدق')).toEqual(['112:2/partial/low']);
  });

  it('runs only when stages 0-4 found nothing, and ranks higher coverage first', () => {
    expect(refs('الله الصمد')).toEqual(['2:1/phrase/high']);
    const out = refs('قل هو الله الصمد'); // 112:1 has 3 of 4, 2:1 has 2 of 4 (50%: excluded)
    expect(out).toEqual(['112:1/partial/low']);
  });
});
