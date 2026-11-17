import * as alignment from './alignment';
import { AlignmentMap, type AlignableAyah } from './alignment-map';

// prettier-ignore
const YA_AYYUHA = String.fromCodePoint(
  0x064a, 0x064e, 0x0670, 0x0653, 0x0623, 0x064e, 0x064a, 0x0651, 0x064f, 0x0647, 0x064e, 0x0627,
);
const U0 = `${YA_AYYUHA} ٱلنَّاسُ ٱعْبُدُوا۟ رَبَّكُمُ`; // simple: يا أيها الناس اعبدوا ربكم
const U1 = 'قُلْ هُوَ ٱللَّهُ أَحَدٌ';

const CORPUS: AlignableAyah[] = [
  { suraNumber: 2, ayahNumber: 21, textSimple: 'يا أيها الناس اعبدوا ربكم', textUthmani: U0 },
  { suraNumber: 112, ayahNumber: 1, textSimple: 'قل هو الله أحد', textUthmani: U1 },
  { suraNumber: 9, ayahNumber: 9, textSimple: 'ا ب ت ث', textUthmani: 'كَلِمَةٌ' }, // forced fallback
];

describe('AlignmentMap', () => {
  const map = AlignmentMap.build(CORPUS);
  const text = (doc: number, ranges: { start: number; end: number }[]) =>
    ranges.map((r) => CORPUS[doc].textUthmani.slice(r.start, r.end));

  it('aligns every ayah in corpus order and reports stats', () => {
    expect(map.size).toBe(3);
    expect(map.get(1).method).toBe('positional');
    expect(map.stats()).toEqual({
      ayahs: 3,
      positional: 1,
      dp: 1,
      fallback: 1,
      mergedWords: 1,
      unmappedUthmaniWords: 0,
      invalid: 0,
    });
    expect(() => map.get(3)).toThrow(RangeError);
  });

  it("'part' highlights the exact sub-word for a merged word", () => {
    expect(text(0, map.rangesFor(0, [1]))).toEqual([YA_AYYUHA.slice(4)]); // أَيُّهَا only
    expect(text(0, map.rangesFor(0, [0]))).toEqual([YA_AYYUHA.slice(0, 4)]); // يَٰٓ only
  });

  it('merges consecutive positions into one continuous range (incl. the space)', () => {
    expect(map.rangesFor(0, [0, 1])).toEqual([{ start: 0, end: 12 }]);
    expect(text(0, map.rangesFor(0, [1, 2]))).toEqual([`${YA_AYYUHA.slice(4)} ٱلنَّاسُ`]);
    expect(text(1, map.rangesFor(1, [3, 1, 2, 2]))).toEqual(['هُوَ ٱللَّهُ أَحَدٌ']); // unsorted + dup
    expect(text(1, map.rangesFor(1, [0, 2]))).toEqual(['قُلْ', 'ٱللَّهُ']); // gap -> two ranges
  });

  it("'word' highlights whole Uthmani words (safe for Arabic shaping)", () => {
    expect(text(0, map.rangesFor(0, [1], 'word'))).toEqual([YA_AYYUHA]);
    expect(text(0, map.rangesFor(0, [0, 1], 'word'))).toEqual([YA_AYYUHA]); // deduplicated
    expect(text(0, map.rangesFor(0, [1, 2], 'word'))).toEqual([`${YA_AYYUHA} ٱلنَّاسُ`]);
    expect(text(0, map.rangesFor(0, [0, 3], 'word'))).toEqual([YA_AYYUHA, 'ٱعْبُدُوا۟']);
  });

  it('returns no ranges for no positions', () => {
    expect(map.rangesFor(1, [])).toEqual([]);
  });

  it.each([[-1], [4], [1.5], [Number.NaN]])('rejects position %p', (p) => {
    expect(() => map.rangesFor(1, [p])).toThrow(RangeError);
  });

  it('does not hand out its internal span objects', () => {
    const [r] = map.rangesFor(1, [0, 1]);
    r.end = 999;
    expect(map.get(1).spans[1].end).not.toBe(999);
    expect(map.rangesFor(1, [0, 1])[0].end).not.toBe(999);
  });

  it('counts alignments that fail validation as invalid', () => {
    const spy = jest.spyOn(alignment, 'validateAlignment').mockReturnValue(['broken']);
    try {
      expect(AlignmentMap.build(CORPUS.slice(0, 2)).stats().invalid).toBe(2);
    } finally {
      spy.mockRestore();
    }
  });
});
