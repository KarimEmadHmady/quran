/**
 * Golden set against the REAL corpus (read-only; part of `npm run test:db`, or alone with
 * `npm run search:eval`).
 *  1. Re-checks the golden file against the data: every ref exists, and for phrase-type cases
 *     `expected` is exactly the set of ayahs containing the phrase.
 *  2. Runs the scorer end to end with the exact-phrase baseline and prints the report.
 *     The baseline numbers are the floor the real engine must beat.
 */
import { ConfigService } from '@nestjs/config';
import { normalize } from '@quran/text-utils';
import type { EnvVars } from '../src/config/env.validation';
import { PrismaService } from '../src/prisma/prisma.service';
import { parseRef, type GoldenCase } from '../src/search/golden/golden-set';
import { loadGoldenSet } from '../src/search/golden/load-golden';
import { evaluateGolden, formatReport } from '../src/search/golden/metrics';
import { containsPhrase, createPhraseBaseline } from '../src/search/golden/phrase-baseline';

/** Categories whose truth is NOT "the ayahs containing the phrase". */
const INTENT_FIXED = new Set<GoldenCase['category']>(['reference', 'negative', 'word_order']);

/** Every normalized query word occurs in the text at least as often as in the query. */
function containsAllWords(normalizedText: string, normalizedQuery: string): boolean {
  const have = new Map<string, number>();
  for (const w of normalizedText.split(' ')) have.set(w, (have.get(w) ?? 0) + 1);
  const need = new Map<string, number>();
  for (const w of normalizedQuery.split(' ')) need.set(w, (need.get(w) ?? 0) + 1);
  return [...need].every(([w, n]) => (have.get(w) ?? 0) >= n);
}

describe('golden set vs the real corpus (read-only)', () => {
  let prisma: PrismaService;
  let docs: { ref: string; textSimple: string; normalized: string }[];
  let ayahCount: Map<number, number>;
  const cases = loadGoldenSet();

  beforeAll(async () => {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('needs DATABASE_URL from apps/backend/.env');
    prisma = new PrismaService(new ConfigService<EnvVars, true>({ DATABASE_URL: url }));
    await prisma.onModuleInit();
    const ayahs = await prisma.ayah.findMany({
      select: { suraNumber: true, ayahNumber: true, textSimple: true },
      orderBy: { id: 'asc' },
    });
    docs = ayahs.map((a) => {
      const textSimple = a.textSimple ?? '';
      return {
        ref: `${a.suraNumber}:${a.ayahNumber}`,
        textSimple,
        normalized: normalize(textSimple),
      };
    });
    const suras = await prisma.sura.findMany({ select: { number: true, ayahCount: true } });
    ayahCount = new Map(suras.map((s) => [s.number, s.ayahCount]));
  });

  afterAll(async () => {
    await prisma?.onModuleDestroy();
  });

  it('every expected ref exists in the corpus', () => {
    const missing = cases.flatMap((c) =>
      c.expected.filter((r) => {
        const ref = parseRef(r);
        return !ref || ref.ayah > (ayahCount.get(ref.sura) ?? 0);
      }),
    );
    expect(missing).toEqual([]);
  });

  it('phrase-type cases list exactly the ayahs that contain the phrase', () => {
    const wrong = cases
      .filter((c) => !INTENT_FIXED.has(c.category) && c.tier === 'clean')
      .filter((c) => {
        const q = normalize(c.q);
        const truth = docs.filter((d) => containsPhrase(d.normalized, q)).map((d) => d.ref);
        return JSON.stringify(truth) !== JSON.stringify(c.expected);
      })
      .map((c) => c.id);
    expect(wrong).toEqual([]);
  });

  it('word_order cases list exactly the ayahs containing every word, none as a phrase', () => {
    const wrong = cases
      .filter((c) => c.category === 'word_order')
      .filter((c) => {
        const q = normalize(c.q);
        const truth = docs.filter((d) => containsAllWords(d.normalized, q)).map((d) => d.ref);
        const phrase = docs.some((d) => containsPhrase(d.normalized, q));
        return phrase || JSON.stringify(truth) !== JSON.stringify(c.expected);
      })
      .map((c) => c.id);
    expect(wrong).toEqual([]);
  });

  it('typo / voice cases: expected = ayahs containing "intended" (typo: the query has an OOV word)', () => {
    const vocabulary = new Set(docs.flatMap((d) => d.normalized.split(' ')));
    const typo = cases.filter((c) => c.tier !== 'clean');
    expect(typo.length).toBeGreaterThan(0);
    const wrong = typo
      .filter((c) => {
        const intended = normalize(c.intended ?? '');
        const truth = docs.filter((d) => containsPhrase(d.normalized, intended)).map((d) => d.ref);
        const hasOov = normalize(c.q)
          .split(' ')
          .some((w) => !vocabulary.has(w));
        return (
          (c.tier === 'typo' && !hasOov) ||
          normalize(c.q) === intended ||
          JSON.stringify(truth) !== JSON.stringify(c.expected)
        );
      })
      .map((c) => c.id);
    expect(wrong).toEqual([]);
  });

  it('negative cases match no ayah', () => {
    const matching = cases
      .filter((c) => c.category === 'negative')
      .filter((c) => docs.some((d) => containsPhrase(d.normalized, normalize(c.q))))
      .map((c) => c.id);
    expect(matching).toEqual([]);
  });

  it('scores the exact-phrase baseline end to end', async () => {
    const report = await evaluateGolden(cases, createPhraseBaseline(docs));
    process.stdout.write(`\n${formatReport(report, 'Baseline: exact normalized phrase')}\n\n`);

    // By construction the baseline is perfect on phrase-type cases and returns nothing for
    // negatives. It cannot parse references; it only "finds" one whose text IS an ayah
    // (Ya-Sin, 36:1). This proves the scorer wiring on real data.
    // Category checks on the clean tier: typo / voice cases need the engine's stages 4-6.
    const clean = await evaluateGolden(
      cases.filter((c) => c.tier === 'clean'),
      createPhraseBaseline(docs),
    );
    for (const [category, summary] of Object.entries(clean.byCategory)) {
      // References and word_order need the engine's stages 0 / 2-3.
      if (category === 'reference' || category === 'word_order') {
        expect(summary.recallAt[5]).toBeLessThan(0.5);
      } else expect([category, summary.recallAt[5]]).toEqual([category, 1]);
    }
    expect(report.byTier.typo.recallAt[5]).toBe(0);
    expect(report.negatives.confidentFalsePositives).toBe(0);
  });
});
