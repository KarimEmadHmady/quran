import { normalize } from '@quran/text-utils';

/** One sura as the reference parser needs it (from the `suras` table, read-only). */
export interface SuraInfo {
  number: number;
  nameAr: string;
  ayahCount: number;
}

/**
 * How a name may be used:
 *  - 'bare': enough on its own ("الكهف", "يس") — claude.md 5.6 stage 0, "sura name only".
 *  - 'signal': only together with "سورة" or an ayah number ("سورة تبارك", "بقرة 255"),
 *    because on its own it is just as likely an ordinary Quran word or phrase.
 */
export type NameUse = 'bare' | 'signal';

/**
 * Well-known alternative names (claude.md 5.6 / S4). Written in natural spelling; they go
 * through the shared normalize() like everything else. Names that are also common Quran
 * words or phrases are 'signal' only.
 */
export const SURA_ALIASES: ReadonlyArray<{ sura: number; name: string; use: NameUse }> = [
  { sura: 1, name: 'فاتحة الكتاب', use: 'bare' },
  { sura: 1, name: 'أم الكتاب', use: 'signal' },
  { sura: 3, name: 'العمران', use: 'bare' },
  { sura: 3, name: 'عمران', use: 'signal' },
  { sura: 9, name: 'براءة', use: 'signal' },
  { sura: 17, name: 'بني إسرائيل', use: 'signal' },
  { sura: 20, name: 'طاها', use: 'bare' },
  { sura: 36, name: 'ياسين', use: 'bare' },
  { sura: 38, name: 'صاد', use: 'bare' },
  { sura: 40, name: 'المؤمن', use: 'signal' },
  { sura: 41, name: 'حم السجدة', use: 'bare' },
  { sura: 47, name: 'القتال', use: 'signal' },
  { sura: 50, name: 'قاف', use: 'bare' },
  { sura: 67, name: 'تبارك', use: 'signal' },
  { sura: 68, name: 'نون', use: 'bare' },
  { sura: 76, name: 'الدهر', use: 'signal' },
  { sura: 78, name: 'عم', use: 'signal' },
  { sura: 83, name: 'التطفيف', use: 'bare' },
  { sura: 87, name: 'سبح', use: 'signal' },
  { sura: 94, name: 'الانشراح', use: 'bare' },
  { sura: 94, name: 'ألم نشرح', use: 'signal' },
  { sura: 96, name: 'اقرأ', use: 'signal' },
  { sura: 99, name: 'الزلزال', use: 'signal' },
  { sura: 111, name: 'تبت', use: 'signal' },
  { sura: 111, name: 'اللهب', use: 'signal' },
  { sura: 112, name: 'التوحيد', use: 'bare' },
];

/** Longest name in words (حم السجدة, فاتحة الكتاب, ...): the parser never tries longer spans. */
export const MAX_NAME_WORDS = 3;

interface NameEntry {
  sura: number;
  use: NameUse;
}

/**
 * Sura lookup for reference parsing: names (canonical, alias, and the "ال"-less form of
 * canonical names, e.g. "بقره") -> sura number, plus ayah counts for range checks.
 * Every key is a normalize() output; two suras can never share a key (build throws).
 */
export class SuraCatalog {
  private constructor(
    private readonly suras: ReadonlyMap<number, SuraInfo>,
    private readonly names: ReadonlyMap<string, NameEntry>,
  ) {}

  /**
   * @param suras rows of the `suras` table.
   * @param corpusAyahCounts sura -> number of ayahs actually indexed; when given, every sura
   *   must match it exactly, so a reference can never point at an ayah the index lacks.
   */
  static build(
    suras: readonly SuraInfo[],
    corpusAyahCounts?: ReadonlyMap<number, number>,
  ): SuraCatalog {
    const byNumber = new Map<number, SuraInfo>();
    for (const s of suras) {
      if (!Number.isInteger(s.number) || s.number < 1 || byNumber.has(s.number)) {
        throw new Error(`sura catalog: invalid or duplicate sura number ${s.number}`);
      }
      if (!Number.isInteger(s.ayahCount) || s.ayahCount < 1) {
        throw new Error(`sura catalog: sura ${s.number} has invalid ayah count ${s.ayahCount}`);
      }
      byNumber.set(s.number, s);
    }
    if (corpusAyahCounts) {
      const mismatched = [...new Set([...byNumber.keys(), ...corpusAyahCounts.keys()])].filter(
        (n) => byNumber.get(n)?.ayahCount !== corpusAyahCounts.get(n),
      );
      if (mismatched.length) {
        throw new Error(
          `sura catalog: ayah_count disagrees with the indexed ayahs for sura(s) ${mismatched.join(', ')}`,
        );
      }
    }

    const names = new Map<string, NameEntry>();
    const add = (raw: string, sura: number, use: NameUse) => {
      const key = normalize(raw);
      if (key === '') throw new Error(`sura catalog: name "${raw}" normalizes to nothing`);
      const prev = names.get(key);
      if (prev && prev.sura !== sura) {
        throw new Error(`sura catalog: name "${key}" maps to suras ${prev.sura} and ${sura}`);
      }
      // The same key from two sources (e.g. canonical + alias): the more permissive use wins.
      if (!prev || (prev.use === 'signal' && use === 'bare')) names.set(key, { sura, use });
    };

    for (const s of byNumber.values()) add(s.nameAr, s.number, 'bare');
    for (const s of byNumber.values()) {
      const key = normalize(s.nameAr);
      // "البقره" -> "بقره": typed without the article; only with an explicit signal.
      if (/^ال\S{2,}$/.test(key) && !names.has(key.slice(2))) add(key.slice(2), s.number, 'signal');
    }
    for (const a of SURA_ALIASES) if (byNumber.has(a.sura)) add(a.name, a.sura, a.use);

    for (const key of names.keys()) {
      if (key.split(' ').length > MAX_NAME_WORDS) {
        throw new Error(`sura catalog: name "${key}" is longer than ${MAX_NAME_WORDS} words`);
      }
    }
    return new SuraCatalog(byNumber, names);
  }

  get size(): number {
    return this.suras.size;
  }

  get(number: number): SuraInfo | undefined {
    return this.suras.get(number);
  }

  /** Sura for a normalized name; 'signal' names only when `signalled` is true. */
  lookupName(normalizedName: string, signalled: boolean): number | undefined {
    const e = this.names.get(normalizedName);
    if (!e) return undefined;
    return e.use === 'bare' || signalled ? e.sura : undefined;
  }

  /** Every name key with its sura and use (for tests and diagnostics). */
  nameEntries(): Array<{ name: string; sura: number; use: NameUse }> {
    return [...this.names].map(([name, e]) => ({ name, ...e }));
  }
}
