/**
 * S5 integration: the search engine (stages 0-3 + ranking) on the REAL corpus (Phase 3
 * corrections are measured in test/search-corrector.db-spec.ts) (read-only;
 * part of `npm run test:db` and `npm run search:eval`).
 *  - golden metrics of the engine; phrase-type cases keep exactly the baseline's ayahs, ranked
 *    before any weaker stage (no regression from stages 2-3)
 *  - every result of 1000 sampled queries satisfies its matchType, stages never interleave,
 *    and the ayah a shuffled query came from is found
 *  - latency vs the claude.md 5.11 target (< 30 ms)
 */
import { ConfigService } from '@nestjs/config';
import { normalize } from '@quran/text-utils';
import type { EnvVars } from '../src/config/env.validation';
import { PrismaService } from '../src/prisma/prisma.service';
import { createEngineSearch } from '../src/search/golden/engine-search';
import { loadGoldenSet } from '../src/search/golden/load-golden';
import { evaluateGolden, formatReport } from '../src/search/golden/metrics';
import { containsPhrase, createPhraseBaseline } from '../src/search/golden/phrase-baseline';
import { CorpusLoader } from '../src/search/index/corpus-loader.service';
import {
  buildSnapshot,
  type SearchIndexService,
  type SearchSnapshot,
} from '../src/search/index/search-index.service';
import { tokenize } from '../src/search/index/tokenize';
import { MIN_RESULTS, ORDERED_WINDOW_FACTOR, orderedWindow } from '../src/search/ranking/stages';
import { SearchService, type MatchType } from '../src/search/search.service';

const STAGE_RANK: Record<MatchType, number> = {
  reference: 0,
  phrase: 1,
  ordered: 2,
  all_terms: 3,
  corrected: 4,
  partial: 5,
  loose: 6,
};
const PHRASE_CATEGORIES = new Set([
  'phrase',
  'hamza_diacritics',
  'teh_alef_variants',
  'stopwords',
  'partial',
]);

/** Deterministic PRNG (mulberry32) so the sample is reproducible. */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('search engine on the real corpus (read-only)', () => {
  let prisma: PrismaService;
  let snapshot: SearchSnapshot;
  let service: SearchService;
  let docs: { ref: string; textSimple: string; normalized: string }[];
  const golden = loadGoldenSet();

  beforeAll(async () => {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('needs DATABASE_URL from apps/backend/.env');
    prisma = new PrismaService(new ConfigService<EnvVars, true>({ DATABASE_URL: url }));
    await prisma.onModuleInit();
    const loader = new CorpusLoader(prisma);
    const corpus = await loader.load();
    snapshot = buildSnapshot(corpus, await loader.loadSuras());
    service = new SearchService({
      currentSnapshot: () => snapshot,
    } as unknown as SearchIndexService);
    docs = corpus.map((d) => ({
      ref: `${d.suraNumber}:${d.ayahNumber}`,
      textSimple: d.textSimple,
      normalized: normalize(d.textSimple),
    }));
  });

  afterAll(async () => {
    await prisma?.onModuleDestroy();
  });

  it('golden set: engine metrics (Phase 2: clean R@5 >= 95%; Phase 3: typo R@5 >= 90%)', async () => {
    const report = await evaluateGolden(golden, createEngineSearch(service));
    process.stdout.write(`\n${formatReport(report, 'Engine: stages 0-6 + ranking')}\n\n`);
    expect(report.byTier.clean.recallAt[5]).toBeGreaterThanOrEqual(0.95);
    expect(report.byTier.typo.recallAt[5]).toBeGreaterThanOrEqual(0.9);
    expect(report.byTier.voice.recallAt[5]).toBeGreaterThanOrEqual(0.9); // Phase 4 golden voice tier
    expect(report.byCategory.reference.recallAt[1]).toBe(1);
    expect(report.byCategory.word_order.recallAt[5]).toBe(1);
    expect(report.negatives.confidentFalsePositives).toBe(0);
  });

  it('phrase-type cases: the same ayahs as the baseline, all ranked before weaker stages', async () => {
    const baseline = createPhraseBaseline(docs);
    const problems: string[] = [];
    for (const c of golden.filter((g) => PHRASE_CATEGORIES.has(g.category))) {
      const want = new Set((await baseline(c.q, 'text')).map((h) => h.ref));
      const results = service.search(c.q, { limit: 10_000 }).results;
      const strong = results.filter((r) => r.matchType === 'phrase' || r.matchType === 'reference');
      const strongRefs = new Set(strong.map((r) => r.ref));
      const firstWeak = results.findIndex((r) => STAGE_RANK[r.matchType] > 1);
      if (
        strongRefs.size !== want.size ||
        [...want].some((r) => !strongRefs.has(r)) ||
        (firstWeak !== -1 && firstWeak < strong.length)
      ) {
        problems.push(c.id);
      }
    }
    expect(problems).toEqual([]);
  });

  it('1000 sampled queries: every result satisfies its matchType; stages never interleave', () => {
    const rand = prng(5);
    const { index } = snapshot;
    const problems: string[] = [];
    let found = 0;
    const stopRuleMisses: string[] = [];
    let latencies: number[] = [];
    for (let i = 0; i < 1000; i++) {
      const d = Math.floor(rand() * index.docCount);
      const words = index.docTokens(d);
      if (words.length < 2) continue;
      const n = 2 + Math.floor(rand() * Math.min(3, words.length - 1));
      const start = Math.floor(rand() * (words.length - n + 1));
      const picked = words.slice(start, start + n);
      // half the queries shuffled (stages 2-3), half kept in order (phrase)
      const q = (i % 2 ? [...picked].sort(() => rand() - 0.5) : picked).join(' ');

      const t0 = performance.now();
      const out = service.search(q, { limit: 10_000 });
      latencies.push(performance.now() - t0);

      const tokens = tokenize(q);
      if (out.results.some((r) => r.ref === index.doc(d).ref)) {
        found++;
      } else {
        // The only acceptable miss: the 5.6 stop rule skipped the weaker stage(s) after
        // >= MIN_RESULTS stronger hits (the shuffled words form a common phrase elsewhere).
        const ranks = out.results.map((r) => STAGE_RANK[r.matchType]);
        if (out.results.length >= MIN_RESULTS && !ranks.includes(3)) {
          stopRuleMisses.push(`${index.doc(d).ref} (${out.results.length} stronger hits)`);
        } else {
          problems.push(`${q}: source ayah ${index.doc(d).ref} missing`);
        }
      }
      let prevStage = -1;
      for (const r of out.results) {
        const stage = STAGE_RANK[r.matchType];
        if (stage < prevStage) problems.push(`${q}: stages out of order`);
        prevStage = stage;
        const di = index.docIndexOf(r.suraNumber, r.ayahNumber)!;
        const text = index.docTokens(di).join(' ');
        const lists = tokens.map((t) => index.positions(t, di));
        const ow = orderedWindow(lists);
        const ok =
          r.matchType === 'reference' ||
          (r.matchType === 'phrase' && containsPhrase(text, tokens.join(' '))) ||
          (r.matchType === 'ordered' &&
            !containsPhrase(text, tokens.join(' ')) &&
            ow !== null &&
            ow.span <= ORDERED_WINDOW_FACTOR * tokens.length) ||
          (r.matchType === 'all_terms' &&
            index.docsWithAll(tokens).includes(di) &&
            (ow === null || ow.span > ORDERED_WINDOW_FACTOR * tokens.length));
        if (!ok) problems.push(`${q}: ${r.ref} is not a valid ${r.matchType}`);
        if (r.highlights.length === 0 && r.matchType !== 'reference') {
          problems.push(`${q}: ${r.ref} has no highlight`);
        }
      }
      // Stop rule: weaker stages appear only while fewer than MIN_RESULTS were gathered.
      const strong = out.results.filter((r) => STAGE_RANK[r.matchType] <= 1).length;
      if (strong >= MIN_RESULTS && out.results.length > strong) {
        problems.push(`${q}: stop rule ignored`);
      }
    }
    expect(problems.slice(0, 10)).toEqual([]);
    expect(found).toBeGreaterThan(0);

    latencies = latencies.sort((a, b) => a - b);
    const p = (x: number) => latencies[Math.floor(x * (latencies.length - 1))];
    process.stdout.write(
      `sampled queries: ${latencies.length}, source ayah found: ${found}, ` +
        `latency ms p50=${p(0.5).toFixed(2)} p95=${p(0.95).toFixed(2)} max=${p(1).toFixed(2)}\n` +
        `missed only because of the stop rule: ${stopRuleMisses.length} ` +
        `[${stopRuleMisses.join(', ')}]\n`,
    );
    // Every source ayah is returned, except where the documented stop rule applies.
    expect(found + stopRuleMisses.length).toBe(latencies.length);
    expect(p(0.95)).toBeLessThan(30); // claude.md 5.11
  });
});
