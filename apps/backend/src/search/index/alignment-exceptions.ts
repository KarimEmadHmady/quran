/**
 * The 364 ayahs whose text_simple and text_uthmani word counts differ (found 2026-11-12 by a
 * read-only scan of all 6236 ayahs; claude.md 5.8 / 11.6). The alignment algorithm is generic;
 * this file pins down what it MUST produce, so any change in data or algorithm is caught by
 * test/search-alignment.db-spec.ts.
 *
 * 1. 344 ayahs: one vocative merge. Simple writes "يا" + noun as two words, Uthmani as one
 *    (يا أيها -> يَٰٓأَيُّهَا 141x, يا قوم 38x, يا موسى 24x, يا بني 19x, ...). Rule checked for
 *    each: exactly one merge of 2 simple words, the first normalizes to "يا", nothing skipped.
 * 2. The 20 ayahs below, each with its exact merges / skipped Uthmani words.
 *
 * Positions are 0-based word indexes. merges: [simpleStart, simpleCount, uthmaniIndex].
 */
export const VOCATIVE_SIMPLE_WORD = 'يا';
export const VOCATIVE_MERGE_AYAHS = 344;

/**
 * Merged words whose split part is spelled differently in Uthmani (letter distance 2 after
 * dropping marks). The splits are correct: the Uthmani spelling itself differs.
 *   صاحبي -> صَٰحِبَىِ (alef as dagger alef, ى for ي) · سامري -> سَٰمِرِىُّ · هامان -> هَٰمَٰنُ
 * Format: "sura:ayah#simpleWordIndex".
 */
export const SPELLING_DIFFERENCES_IN_MERGES: readonly string[] = [
  '12:39#1',
  '12:41#1',
  '20:95#4',
  '28:38#14',
  '40:36#3',
];

export interface KnownAlignmentCase {
  ref: string;
  pattern: string;
  merges: [simpleStart: number, simpleCount: number, uthmaniIndex: number][];
  unmappedUthmani: number[];
}

export const KNOWN_ALIGNMENT_CASES: readonly KnownAlignmentCase[] = [
  // "ها أنتم" (2 simple words) written as one Uthmani word
  { ref: '3:66', pattern: 'ha antum', merges: [[0, 2, 0]], unmappedUthmani: [] },
  { ref: '3:119', pattern: 'ha antum', merges: [[0, 2, 0]], unmappedUthmani: [] },
  { ref: '4:109', pattern: 'ha antum', merges: [[0, 2, 0]], unmappedUthmani: [] },
  { ref: '47:38', pattern: 'ha antum', merges: [[0, 2, 0]], unmappedUthmani: [] },
  // "و" + vocative written as one Uthmani word: "ويا قوم" (9x), "ويا آدم" (7:19)
  { ref: '7:19', pattern: 'wa-ya + noun', merges: [[0, 2, 0]], unmappedUthmani: [] },
  { ref: '11:29', pattern: 'wa-ya + noun', merges: [[0, 2, 0]], unmappedUthmani: [] },
  { ref: '11:30', pattern: 'wa-ya + noun', merges: [[0, 2, 0]], unmappedUthmani: [] },
  { ref: '11:52', pattern: 'wa-ya + noun', merges: [[0, 2, 0]], unmappedUthmani: [] },
  { ref: '11:64', pattern: 'wa-ya + noun', merges: [[0, 2, 0]], unmappedUthmani: [] },
  { ref: '11:85', pattern: 'wa-ya + noun', merges: [[0, 2, 0]], unmappedUthmani: [] },
  { ref: '11:89', pattern: 'wa-ya + noun', merges: [[0, 2, 0]], unmappedUthmani: [] },
  { ref: '11:93', pattern: 'wa-ya + noun', merges: [[0, 2, 0]], unmappedUthmani: [] },
  { ref: '40:32', pattern: 'wa-ya + noun', merges: [[0, 2, 0]], unmappedUthmani: [] },
  { ref: '40:41', pattern: 'wa-ya + noun', merges: [[0, 2, 0]], unmappedUthmani: [] },
  // Two vocatives in one ayah: "يا أرض" + "ويا سماء"
  {
    ref: '11:44',
    pattern: 'two vocatives',
    merges: [
      [1, 2, 1],
      [5, 2, 4],
    ],
    unmappedUthmani: [],
  },
  // "يا أيها" + "يا هامان"
  {
    ref: '28:38',
    pattern: 'two vocatives',
    merges: [
      [2, 2, 2],
      [13, 2, 12],
    ],
    unmappedUthmani: [],
  },
  // "يا بني" + "يا أبت"
  {
    ref: '37:102',
    pattern: 'two vocatives',
    merges: [
      [5, 2, 5],
      [17, 2, 16],
    ],
    unmappedUthmani: [],
  },
  // Three words -> one: "يا ابن أم" -> "يَبْنَؤُمَّ"
  { ref: '20:94', pattern: 'ya ibna umm (3->1)', merges: [[1, 3, 1]], unmappedUthmani: [] },
  // "وأن لو" -> "وَأَلَّوِ"
  { ref: '72:16', pattern: 'wa-an law', merges: [[0, 2, 0]], unmappedUthmani: [] },
  // DATA QUIRK: text_uthmani of 97:1 begins with the basmala (4 words) that text_simple does
  // not have. Those 4 Uthmani words get no simple word; the 5 ayah words align 1:1 after them.
  // The data is left unchanged (read-only); see claude.md 11.6.
  {
    ref: '97:1',
    pattern: 'basmala prefix in text_uthmani',
    merges: [],
    unmappedUthmani: [0, 1, 2, 3],
  },
];
