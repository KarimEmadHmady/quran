import {
  alignAyah,
  isCombiningMark,
  letterKey,
  levenshtein,
  skeleton,
  validateAlignment,
  wordSkeletons,
  wordSpans,
  type AyahAlignment,
} from './alignment';

// Exact code points of the first word of 2:21 in text_uthmani (read from the DB).
// prettier-ignore
const YA_AYYUHA = String.fromCodePoint(
  0x064a, 0x064e, 0x0670, 0x0653, 0x0623, 0x064e, 0x064a, 0x0651, 0x064f, 0x0647, 0x064e, 0x0627,
);

/** The Uthmani text each simple word is mapped to. */
const slices = (a: AyahAlignment, uthmani: string) =>
  a.spans.map((s) => uthmani.slice(s.start, s.end));

describe('character helpers', () => {
  it('isCombiningMark covers tashkeel, dagger alef and Quranic marks only', () => {
    for (const c of [
      0x064b, 0x064e, 0x0651, 0x0652, 0x0653, 0x0654, 0x0670, 0x06d6, 0x06df, 0x06e5, 0x06ed,
    ]) {
      expect(isCombiningMark(c)).toBe(true);
    }
    for (const c of [0x0627, 0x0623, 0x0671, 0x064a, 0x0640, 0x0020, 0x06ee, 0x0041]) {
      expect(isCombiningMark(c)).toBe(false);
    }
  });

  it('letterKey drops marks and tatweel, maps alef wasla, keeps hamza forms', () => {
    expect(letterKey('ٱلْحَمْدُ')).toBe('الحمد');
    expect(letterKey(YA_AYYUHA)).toBe('يأيها');
    expect(letterKey('مـحمد')).toBe('محمد');
  });

  it('skeleton is spelling-insensitive (no alef, normalized)', () => {
    expect(skeleton('ٱلْعَٰلَمِينَ')).toBe(skeleton('العالمين'));
    expect(skeleton('يا أيها')).toBe(skeleton(YA_AYYUHA));
    expect(skeleton('ٱلصَّلَوٰةَ')).toBe('لصلوه');
  });

  it('wordSkeletons: one normalize() pass, same result as per-word skeleton()', () => {
    const ws = ['قُلْ', 'هُوَ', 'ٱللَّهُ', 'أَحَدٌ'];
    expect(wordSkeletons(ws)).toEqual(ws.map(skeleton));
  });

  it('wordSkeletons falls back per word when normalization would change the word count', () => {
    expect(wordSkeletons(['hello', 'قل'])).toEqual(['', 'قل']); // "hello" normalizes to nothing
    expect(wordSkeletons(['a-b', 'قل'])).toEqual([skeleton('a-b'), 'قل']);
    expect(wordSkeletons([])).toEqual([]);
  });

  it('levenshtein', () => {
    expect(levenshtein('', '')).toBe(0);
    expect(levenshtein('abc', '')).toBe(3);
    expect(levenshtein('', 'ab')).toBe(2);
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('same', 'same')).toBe(0);
  });

  it('wordSpans splits on any whitespace and reports UTF-16 offsets', () => {
    expect(wordSpans('ab  cd\te ')).toEqual([
      { start: 0, end: 2 },
      { start: 4, end: 6 },
      { start: 7, end: 8 },
    ]);
    expect(wordSpans('')).toEqual([]);
    expect(wordSpans('   ')).toEqual([]);
  });
});

describe('alignAyah', () => {
  it('positional: equal word counts map word i to word i (full Uthmani word)', () => {
    const u = 'قُلْ هُوَ ٱللَّهُ أَحَدٌ';
    const a = alignAyah('قل هو الله أحد', u);
    expect(a.method).toBe('positional');
    expect(slices(a, u)).toEqual(['قُلْ', 'هُوَ', 'ٱللَّهُ', 'أَحَدٌ']);
    expect(a.uthmaniIndexOf).toEqual([0, 1, 2, 3]);
    expect(a.merges).toEqual([]);
    expect(validateAlignment(a, u)).toEqual([]);
  });

  it('forceDp gives the same result as the positional shortcut', () => {
    const u = 'قُلْ هُوَ ٱللَّهُ أَحَدٌ';
    const fast = alignAyah('قل هو الله أحد', u);
    const dp = alignAyah('قل هو الله أحد', u, { forceDp: true });
    expect(dp.method).toBe('dp');
    expect(dp.spans).toEqual(fast.spans);
    expect(dp.uthmaniIndexOf).toEqual(fast.uthmaniIndexOf);
  });

  it('vocative "يا أيها" -> one Uthmani word, split as يَٰٓ | أَيُّهَا', () => {
    const u = `${YA_AYYUHA} ٱلنَّاسُ ٱعْبُدُوا۟ رَبَّكُمُ`;
    const a = alignAyah('يا أيها الناس اعبدوا ربكم', u);
    expect(a.method).toBe('dp');
    expect(slices(a, u)).toEqual([
      YA_AYYUHA.slice(0, 4),
      YA_AYYUHA.slice(4),
      'ٱلنَّاسُ',
      'ٱعْبُدُوا۟',
      'رَبَّكُمُ',
    ]);
    expect(a.spans.slice(0, 2)).toEqual([
      { start: 0, end: 4 },
      { start: 4, end: 12 },
    ]);
    expect(a.uthmaniIndexOf).toEqual([0, 0, 1, 2, 3]);
    expect(a.merges).toEqual([{ simpleStart: 0, simpleCount: 2, uthmaniIndex: 0 }]);
    expect(validateAlignment(a, u)).toEqual([]);
  });

  it('equal counts but shifted words (merge + extra Uthmani word) fall through to DP', () => {
    const u = `${YA_AYYUHA} ٱلنَّاسُ ٱعْبُدُوا۟ رَبَّكُمُ`;
    const a = alignAyah('يا أيها الناس اعبدوا', u);
    expect(a.method).toBe('dp');
    expect(a.uthmaniIndexOf).toEqual([0, 0, 1, 2]);
    expect(a.unmappedUthmani).toEqual([3]);
  });

  it('DP band: the default band matches an unbanded run; a zero band cannot follow a drift', () => {
    const u = `${YA_AYYUHA} ٱلنَّاسُ ٱعْبُدُوا۟ رَبَّكُمُ`;
    const s = 'يا أيها الناس اعبدوا';
    const banded = alignAyah(s, u, { forceDp: true });
    const full = alignAyah(s, u, { forceDp: true, band: Infinity });
    expect(banded.spans).toEqual(full.spans);
    // Same counts (d ends at 0) but the true path drifts to d = 1: band 0 forces 1:1 pairs.
    const narrow = alignAyah(s, u, { forceDp: true, band: 0 });
    expect(narrow.merges).toEqual([]);
    expect(narrow.uthmaniIndexOf).toEqual([0, 1, 2, 3]);
  });

  it('"ويا قوم" -> وَيَٰ | قَوْمِ', () => {
    const u = 'وَيَٰقَوْمِ ٱعْبُدُوا۟';
    const a = alignAyah('ويا قوم اعبدوا', u);
    expect(slices(a, u)).toEqual(['وَيَٰ', 'قَوْمِ', 'ٱعْبُدُوا۟']);
  });

  it('"ها أنتم" -> هَٰٓ | أَنتُمْ', () => {
    const u = 'هَٰٓأَنتُمْ هَٰٓؤُلَآءِ';
    const a = alignAyah('ها أنتم هؤلاء', u);
    expect(slices(a, u)).toEqual(['هَٰٓ', 'أَنتُمْ', 'هَٰٓؤُلَآءِ']);
  });

  it('three simple words in one Uthmani word: "يا ابن أم" (20:94)', () => {
    const u = 'قَالَ يَبْنَؤُمَّ لَا';
    const a = alignAyah('قال يا ابن أم لا', u);
    expect(slices(a, u)).toEqual(['قَالَ', 'يَ', 'بْنَ', 'ؤُمَّ', 'لَا']);
    expect(a.merges).toEqual([{ simpleStart: 1, simpleCount: 3, uthmaniIndex: 1 }]);
    expect(validateAlignment(a, u)).toEqual([]);
  });

  it('"وأن لو" -> وَأَ | لَّوِ (72:16)', () => {
    const u = 'وَأَلَّوِ ٱسْتَقَٰمُوا۟';
    const a = alignAyah('وأن لو استقاموا', u);
    expect(slices(a, u)).toEqual(['وَأَ', 'لَّوِ', 'ٱسْتَقَٰمُوا۟']);
  });

  it('extra Uthmani words (basmala before 97:1) are skipped, not matched', () => {
    const u = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ إِنَّآ أَنزَلْنَٰهُ فِى لَيْلَةِ ٱلْقَدْرِ';
    const a = alignAyah('إنا أنزلناه في ليلة القدر', u);
    expect(a.method).toBe('dp');
    expect(a.unmappedUthmani).toEqual([0, 1, 2, 3]);
    expect(a.uthmaniIndexOf).toEqual([4, 5, 6, 7, 8]);
    expect(slices(a, u)).toEqual(['إِنَّآ', 'أَنزَلْنَٰهُ', 'فِى', 'لَيْلَةِ', 'ٱلْقَدْرِ']);
    expect(validateAlignment(a, u)).toEqual([]);
  });

  it('never splits a letter from its marks (spans start/end on letter boundaries)', () => {
    const u = `${YA_AYYUHA} ٱلنَّاسُ`;
    const a = alignAyah('يا أيها الناس', u);
    for (const s of a.spans) {
      expect(isCombiningMark(u.charCodeAt(s.start))).toBe(false);
      if (s.end < u.length) expect(isCombiningMark(u.charCodeAt(s.end))).toBe(false);
    }
  });

  it('offsets are UTF-16 code units (String.slice compatible), also with astral characters', () => {
    const astral = String.fromCodePoint(0x1d538); // 2 UTF-16 units
    const u = `${astral}قُلْ هُوَ`;
    const a = alignAyah('قل هو', u);
    expect(a.spans[0]).toEqual({ start: 0, end: 2 + 'قُلْ'.length });
    expect(slices(a, u)).toEqual([`${astral}قُلْ`, 'هُوَ']);
  });

  it('empty texts align trivially', () => {
    const a = alignAyah('', '');
    expect(a).toMatchObject({ method: 'positional', simpleCount: 0, spans: [] });
  });

  it('falls back to whole-ayah spans when no alignment exists (more than 3 words per Uthmani word)', () => {
    const u = 'كَلِمَةٌ';
    const a = alignAyah('ا ب ت ث', u);
    expect(a.method).toBe('fallback');
    expect(a.spans).toEqual(Array(4).fill({ start: 0, end: u.length }));
    expect(a.uthmaniIndexOf).toEqual([0, 0, 0, 0]);
  });

  it('falls back when a merged Uthmani word is too short to split', () => {
    const a = alignAyah('يا ب', 'ي');
    expect(a.method).toBe('fallback');
  });

  it('falls back when the Uthmani text is empty but simple words exist', () => {
    expect(alignAyah('قل', '').method).toBe('fallback');
  });
});

describe('validateAlignment', () => {
  const u = 'قُلْ هُوَ';
  const good = alignAyah('قل هو', u);

  it('accepts a valid alignment', () => {
    expect(validateAlignment(good, u)).toEqual([]);
  });

  it.each([
    ['span count', { spans: [good.spans[0]] }, /span count/],
    ['empty span', { spans: [{ start: 1, end: 1 }, good.spans[1]] }, /empty or out of bounds/],
    ['out of bounds', { spans: [good.spans[0], { start: 5, end: 99 }] }, /out of bounds/],
    ['overlap', { spans: [good.spans[0], { start: 2, end: 9 }] }, /overlaps or out of order/],
    ['whitespace', { spans: [{ start: 0, end: 6 }, good.spans[1]] }, /contains whitespace/],
    [
      'starts on a mark',
      { spans: [{ start: 1, end: 4 }, good.spans[1]] },
      /starts on a combining mark/,
    ],
    [
      'cuts before a mark',
      { spans: [{ start: 0, end: 1 }, good.spans[1]] },
      /cuts before a combining mark/,
    ],
    ['outside host word', { uthmaniIndexOf: [1, 1] }, /outside its Uthmani word/],
  ])('reports %s', (_label, patch, message) => {
    const problems = validateAlignment({ ...good, ...patch }, u);
    expect(problems.join('\n')).toMatch(message);
  });
});

describe('levenshtein buffers', () => {
  it('stays correct across calls of different lengths (reused, growing buffers)', () => {
    const long = 'ب'.repeat(300);
    expect(levenshtein(long, `${long}ت`)).toBe(1);
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('ab', 'ba')).toBe(2);
    expect(levenshtein(long, 'ب')).toBe(299);
  });
});
