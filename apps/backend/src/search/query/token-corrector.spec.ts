import { Vocabulary } from '../index/vocabulary';
import {
  MATCH_QUALITY,
  neighbours,
  planCorrection,
  splitCandidate,
  wordCandidates,
} from './token-corrector';

/** Vocabulary from [word, df] pairs. */
const vocabOf = (pairs: [string, number][]) =>
  new Vocabulary(pairs.map(([word, df], termId) => ({ word, termId, df, cf: df, idf: 1 })));

const VOCAB = vocabOf([
  ['الرحمن', 45],
  ['الرحيم', 34],
  ['الضالين', 6],
  ['الظالمين', 64],
  ['الصلاه', 55],
  ['الصراط', 40],
  ['قل', 300],
  ['هو', 400],
  ['الله', 2000],
  ['احد', 50],
  ['ال', 22],
  ['بسم', 3],
  ['الدين', 90],
  ['يعلمون', 80],
  ['يعملون', 56],
  ['مسيولا', 4],
]);

describe('wordCandidates (claude.md 5.5 steps 3-5)', () => {
  it('phonetic matches first (cost 0.5)', () => {
    expect(wordCandidates(VOCAB, 'السراط')[0]).toEqual({
      original: 'السراط',
      candidate: 'الصراط',
      kind: 'phonetic',
      cost: 0.5,
    });
  });

  it('edit distance on trigram candidates; ranked by cost, then df, then length', () => {
    const c = wordCandidates(VOCAB, 'الظالين');
    // الظالمين (df 64) before الضالين (df 6): both one edit away.
    expect(c.slice(0, 2).map((x) => [x.candidate, x.kind, x.cost])).toEqual([
      ['الظالمين', 'edit1', 1],
      ['الضالين', 'edit1', 1],
    ]);
  });

  it('a keyboard slip costs 0.5', () => {
    expect(wordCandidates(VOCAB, 'الدبن')[0]).toMatchObject({
      candidate: 'الدين',
      kind: 'edit1',
      cost: 0.5,
    });
  });

  it('length 6+ allows two edits', () => {
    expect(wordCandidates(VOCAB, 'الرحمان').map((c) => c.candidate)).toContain('الرحمن');
    expect(wordCandidates(VOCAB, 'لرحبيم').find((c) => c.candidate === 'الرحيم')?.kind).toBe(
      'edit2',
    );
  });

  it('no fuzzy matching up to 3 letters (only phonetic)', () => {
    expect(wordCandidates(VOCAB, 'هوا')).toEqual([]);
    expect(wordCandidates(VOCAB, 'احب')).toEqual([]); // احد is 1 edit away, but too short
    expect(wordCandidates(VOCAB, 'اهد')[0]).toMatchObject({ candidate: 'احد', kind: 'phonetic' });
  });

  it('skeleton only as the last resort', () => {
    // "الصلوه": edit1 to الصلاه exists, so skeleton is not used.
    expect(wordCandidates(VOCAB, 'الصلوه')[0].kind).toBe('edit1');
    const v = vocabOf([['ذلك', 1]]);
    // "ذاليك": 2 edits (over the limit for 5 letters), not phonetic-equal, same skeleton.
    expect(wordCandidates(v, 'ذاليك')).toEqual([
      { original: 'ذاليك', candidate: 'ذلك', kind: 'skeleton', cost: 3 },
    ]);
  });

  it('never offers the word itself', () => {
    expect(wordCandidates(VOCAB, 'الرحمن').map((c) => c.candidate)).not.toContain('الرحمن');
  });
});

describe('splitCandidate (claude.md 5.5 step 6)', () => {
  it('splits glued words into vocabulary words (fewest parts)', () => {
    expect(splitCandidate(VOCAB, 'قلهوالله')).toEqual({ words: ['قل', 'هو', 'الله'], cost: 1 });
    expect(splitCandidate(VOCAB, 'بسمالله')).toEqual({ words: ['بسم', 'الله'], cost: 0.5 });
  });

  it('tries again without a leading clitic', () => {
    expect(splitCandidate(VOCAB, 'والرحمن')).toEqual({ words: ['الرحمن'], cost: 0.5 });
    expect(splitCandidate(VOCAB, 'وقلهو')).toEqual({ words: ['قل', 'هو'], cost: 1 });
  });

  it('returns null when no split works', () => {
    expect(splitCandidate(VOCAB, 'كمبيوتر')).toBeNull();
    expect(splitCandidate(VOCAB, 'وا')).toBeNull();
  });

  it('prefers the split whose rarest part is most frequent', () => {
    const v = vocabOf([
      ['ابت', 1],
      ['ثج', 1],
      ['اب', 50],
      ['تثج', 40],
    ]);
    expect(splitCandidate(v, 'ابتثج')?.words).toEqual(['اب', 'تثج']);
  });
});

describe('planCorrection', () => {
  it('rule 5.1: vocabulary words are never changed (يعلمون / يعملون)', () => {
    const plan = planCorrection(VOCAB, ['يعلمون', 'يعملون', 'الله']);
    expect(plan.changed).toBe(false);
    expect(plan.slots.map((s) => s.options)).toEqual([
      [{ word: 'يعلمون', kind: 'exact', cost: 0, quality: 1 }],
      [{ word: 'يعملون', kind: 'exact', cost: 0, quality: 1 }],
      [{ word: 'الله', kind: 'exact', cost: 0, quality: 1 }],
    ]);
  });

  it('keeps every candidate within 0.5 of the best ("show both", 5.12)', () => {
    const plan = planCorrection(VOCAB, ['ولا', 'الظالين']);
    expect(plan.changed).toBe(true);
    expect(plan.slots[1].options.map((o) => o.word)).toEqual(['الظالمين', 'الضالين']);
    expect(plan.slots[1].options[0].quality).toBe(MATCH_QUALITY.edit1);
    expect(plan.slots[0].options).toEqual([]); // "ولا" is not in this vocabulary
  });

  it('merges two neighbours when one is OOV and together they are a word', () => {
    const plan = planCorrection(VOCAB, ['ال', 'رحمن', 'الرحيم']);
    expect(plan.slots.map((s) => [s.original, s.options.map((o) => [o.word, o.kind])])).toEqual([
      ['ال رحمن', [['الرحمن', 'merge']]],
      ['الرحيم', [['الرحيم', 'exact']]],
    ]);
  });

  it('does not merge two vocabulary words', () => {
    const v = vocabOf([
      ['قل', 1],
      ['هو', 1],
      ['قلهو', 1],
    ]);
    expect(planCorrection(v, ['قل', 'هو']).changed).toBe(false);
  });

  it('splits only when no single-word candidate exists, unless preferSplit', () => {
    const glued = planCorrection(VOCAB, ['قلهوالله', 'احد']);
    expect(glued.splits).toBe(1);
    expect(glued.slots.map((s) => [s.original, s.splitGroup, s.options[0].word])).toEqual([
      ['قلهوالله', 1, 'قل'],
      ['قلهوالله', 1, 'هو'],
      ['قلهوالله', 1, 'الله'],
      ['احد', undefined, 'احد'],
    ]);
    // "الرحم" has edit candidates: no split by default, split with preferSplit.
    const v = vocabOf([
      ['الرحيم', 5],
      ['ال', 5],
      ['رحم', 5],
    ]);
    expect(planCorrection(v, ['الرحم']).splits).toBe(0);
    expect(
      planCorrection(v, ['الرحم'], { preferSplit: true }).slots.map((s) => s.options[0].word),
    ).toEqual(['ال', 'رحم']);
  });

  it('numbers stay as they are and cannot be corrected', () => {
    const plan = planCorrection(VOCAB, ['2', 'الله']);
    expect(plan.slots[0]).toEqual({ original: '2', options: [] });
    expect(plan.changed).toBe(false);
  });

  it('an OOV word with no candidate and no split leaves an empty slot', () => {
    const plan = planCorrection(VOCAB, ['كمبيوتر']);
    expect(plan.slots).toEqual([{ original: 'كمبيوتر', options: [] }]);
    expect(plan.changed).toBe(true);
  });
});

describe('neighbours ("هل تقصد" for vocabulary words)', () => {
  it('phonetic and one-edit neighbours, best first, excluding the word', () => {
    expect(neighbours(VOCAB, 'يعلمون').map((c) => c.candidate)).toEqual(['يعملون']);
    const v = vocabOf([
      ['الصراط', 1],
      ['السراط', 1],
      ['الصراطه', 9],
    ]);
    expect(neighbours(v, 'الصراط').map((c) => [c.candidate, c.kind])).toEqual([
      ['السراط', 'phonetic'],
      ['الصراطه', 'edit1'],
    ]);
  });

  it('short words only get phonetic neighbours; limit applies', () => {
    expect(neighbours(VOCAB, 'هو')).toEqual([]);
    expect(neighbours(VOCAB, 'يعلمون', 1)).toHaveLength(1);
    expect(neighbours(VOCAB, 'الرحمن')).toEqual([]); // nothing one edit away here
  });
});
