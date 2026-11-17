/**
 * Golden query set (claude.md 5.12): the yardstick for every search change.
 * The file lives next to this module (golden-queries.json); validateGoldenSet() rejects any
 * malformed case so a typo cannot silently skew the metrics.
 */

/** Categories from claude.md 5.12. Later phases add cases in the not-yet-used ones. */
export const GOLDEN_CATEGORIES = [
  'reference',
  'phrase',
  'hamza_diacritics',
  'teh_alef_variants',
  'stopwords',
  'partial',
  'negative',
  'uthmani_spelling',
  'typo',
  'confusable_letters',
  'merge_split',
  /** Every word present but not as a contiguous phrase (stages 2-3, claude.md 5.6). */
  'word_order',
] as const;
export type GoldenCategory = (typeof GOLDEN_CATEGORIES)[number];

/** clean = Phase 2 target (Recall@5 >= 95%); typo = Phase 3; voice = Phase 4. */
export const GOLDEN_TIERS = ['clean', 'typo', 'voice'] as const;
export type GoldenTier = (typeof GOLDEN_TIERS)[number];

export type QueryType = 'text' | 'voice';

export interface GoldenCase {
  id: string;
  q: string;
  type: QueryType;
  category: GoldenCategory;
  tier: GoldenTier;
  /** "sura:ayah" refs. Empty only for negative cases. */
  expected: string[];
  /**
   * typo / voice tiers: the query the user meant. `expected` = every ayah containing it as a
   * phrase (re-checked against the DB), so typo cases stay objective like phrase cases.
   */
  intended?: string;
  note?: string;
}

export interface AyahRef {
  sura: number;
  ayah: number;
}

const REF = /^([1-9][0-9]{0,2}):([1-9][0-9]{0,2})$/;
const CASE_ID = /^[a-z_]+-[0-9]{2,}$/;
const MAX_QUERY_LENGTH = 200; // claude.md 10: search input limit

/** "2:255" -> { sura: 2, ayah: 255 }; null for anything else (incl. sura > 114). */
export function parseRef(ref: string): AyahRef | null {
  const m = REF.exec(ref);
  if (!m) return null;
  const sura = Number(m[1]);
  return sura <= 114 ? { sura, ayah: Number(m[2]) } : null;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function includes<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}

/** Returns the typed cases, or throws one Error listing every problem found. */
export function validateGoldenSet(raw: unknown): GoldenCase[] {
  const problems: string[] = [];
  if (!isRecord(raw) || !Array.isArray(raw.cases)) {
    throw new Error('Invalid golden set: expected an object with a "cases" array');
  }

  const seen = new Set<string>();
  const cases: GoldenCase[] = [];
  raw.cases.forEach((c: unknown, i) => {
    const where = `cases[${i}]`;
    if (!isRecord(c)) {
      problems.push(`${where}: not an object`);
      return;
    }
    const at = typeof c.id === 'string' ? `${where} (${c.id})` : where;

    if (typeof c.id !== 'string' || !CASE_ID.test(c.id)) problems.push(`${at}: bad id`);
    else if (seen.has(c.id)) problems.push(`${at}: duplicate id`);
    else seen.add(c.id);

    if (typeof c.q !== 'string' || c.q.trim() === '' || c.q.length > MAX_QUERY_LENGTH) {
      problems.push(`${at}: q must be a non-blank string of at most ${MAX_QUERY_LENGTH} chars`);
    }
    const type = c.type ?? 'text';
    if (type !== 'text' && type !== 'voice') problems.push(`${at}: type must be text or voice`);
    if (!includes(GOLDEN_CATEGORIES, c.category)) problems.push(`${at}: unknown category`);
    if (!includes(GOLDEN_TIERS, c.tier)) problems.push(`${at}: unknown tier`);
    if (c.note !== undefined && typeof c.note !== 'string')
      problems.push(`${at}: note must be a string`);
    if (c.intended !== undefined && (typeof c.intended !== 'string' || c.intended.trim() === '')) {
      problems.push(`${at}: intended must be a non-blank string`);
    }
    if ((c.tier === 'typo' || c.tier === 'voice') && c.intended === undefined) {
      problems.push(`${at}: ${String(c.tier)}-tier cases need "intended"`);
    }

    const expected = c.expected;
    if (!Array.isArray(expected) || !expected.every((r) => typeof r === 'string')) {
      problems.push(`${at}: expected must be an array of "sura:ayah" strings`);
    } else {
      const bad = expected.filter((r) => parseRef(r) === null);
      if (bad.length) problems.push(`${at}: invalid refs ${bad.join(', ')}`);
      if (new Set(expected).size !== expected.length) problems.push(`${at}: duplicate refs`);
      const negative = c.category === 'negative';
      if (negative && expected.length > 0) problems.push(`${at}: negative cases expect []`);
      if (!negative && expected.length === 0) problems.push(`${at}: expected must not be empty`);
    }

    cases.push(c as unknown as GoldenCase);
  });

  if (problems.length) throw new Error(`Invalid golden set:\n  - ${problems.join('\n  - ')}`);
  return cases.map((c) => ({ ...c, type: c.type ?? 'text' }));
}
