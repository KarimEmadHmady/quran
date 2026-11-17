/** Reading data shapes (claude.md 11.3) and the ayah-id <-> sura/ayah index. */

export interface SuraInfo {
  number: number;
  nameAr: string;
  nameEn: string;
  ayahCount: number;
  revelationPlace: 'mecca' | 'medina' | null;
}

/** The public ayah shape returned everywhere by the API. */
export interface Ayah {
  id: number;
  suraNumber: number;
  ayahNumber: number;
  textUthmani: string;
  textSimple: string | null;
  juz: number | null;
  page: number | null;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface TopicNode {
  id: number;
  parentId: number | null;
  title: string;
  description: string | null;
  children?: TopicNode[];
}

export interface PublicTafsir {
  bookId: number;
  bookName: string;
  author: string | null;
  content: string;
}

/** The basmala exactly as stored in 1:1 (code points copied from the DB; mark order matters). */
// prettier-ignore
export const BISMILLAH = String.fromCodePoint(
  0x628, 0x650, 0x633, 0x652, 0x645, 0x650, 0x20,
  0x671, 0x644, 0x644, 0x651, 0x64e, 0x647, 0x650, 0x20,
  0x671, 0x644, 0x631, 0x651, 0x64e, 0x62d, 0x652, 0x645, 0x64e, 0x670, 0x646, 0x650, 0x20,
  0x671, 0x644, 0x631, 0x651, 0x64e, 0x62d, 0x650, 0x64a, 0x645, 0x650,
);

/** Letters only (no harakat, Quranic marks or dagger alif): for comparing Uthmani texts. */
export const bareLetters = (s: string) => s.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '');

/**
 * Whether the sura page shows a basmala header: not for Al-Fatiha (it IS ayah 1), not for
 * At-Tawba, and not when ayah 1's stored text already starts with it (97:1 in this data,
 * claude.md 11.6).
 */
export function showBismillahHeader(suraNumber: number, firstAyahUthmani: string | undefined): boolean {
  if (suraNumber === 1 || suraNumber === 9) return false;
  // Compare letters only: 97:1 stores "بِّسْمِ" (extra shadda) and marks may be ordered differently.
  return !bareLetters(firstAyahUthmani ?? '').startsWith(bareLetters(BISMILLAH));
}

/**
 * Ayah ids run 1..6236 in mushaf order (verified in S2 against the DB), so a sura's first id
 * is 1 + the ayah counts of the suras before it.
 */
export class AyahIndex {
  private readonly firstId: number[] = [];
  private readonly sorted: readonly SuraInfo[];
  readonly total: number;

  constructor(suras: readonly SuraInfo[]) {
    this.sorted = [...suras].sort((a, b) => a.number - b.number);
    let next = 1;
    for (const s of this.sorted) {
      this.firstId[s.number] = next;
      next += s.ayahCount;
    }
    this.total = next - 1;
  }

  /** Ayah id of sura:ayah, or null when out of range. */
  idOf(suraNumber: number, ayahNumber: number): number | null {
    const s = this.sorted.find((x) => x.number === suraNumber);
    if (!s || ayahNumber < 1 || ayahNumber > s.ayahCount) return null;
    return this.firstId[suraNumber] + ayahNumber - 1;
  }

  /** sura:ayah of an ayah id, or null when out of range. */
  refOf(ayahId: number): { sura: SuraInfo; ayahNumber: number } | null {
    if (!Number.isInteger(ayahId) || ayahId < 1 || ayahId > this.total) return null;
    const sorted = this.sorted;
    let lo = 0;
    let hi = sorted.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >>> 1;
      if (this.firstId[sorted[mid].number] <= ayahId) lo = mid;
      else hi = mid - 1;
    }
    const sura = sorted[lo];
    return { sura, ayahNumber: ayahId - this.firstId[sura.number] + 1 };
  }
}

/** Link to an ayah on its sura page. */
export function ayahHref(suraNumber: number, ayahId: number): string {
  return `/surah/${suraNumber}#ayah-${ayahId}`;
}

export const PLACE_LABEL: Record<string, string> = { mecca: 'مكية', medina: 'مدنية' };
