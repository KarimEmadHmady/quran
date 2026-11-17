/**
 * Phase 3 integration: the token corrector on the REAL corpus (read-only; part of
 * `npm run test:db` and `npm run search:eval`). claude.md 8 Phase 3 criteria:
 *   Recall@5 >= 90% on errors, and wrong corrections < 2%.
 *  - rule 5.1, "wrong correction" = a correct (vocabulary) word changed: checked on EVERY
 *    vocabulary word as a query and on 2000 real ayah fragments -> must be 0
 *  - typo-tier golden cases: Recall@5 and how often the applied correction is the intended text
 *  - 1000 synthetic typos (deletion, transposition, keyboard slip, confusable letter, doubling)
 *  - "هل تقصد" suggestions always lead to results; latency of corrected queries
 */
import { ConfigService } from '@nestjs/config';
import { normalize } from '@quran/text-utils';
import type { EnvVars } from '../src/config/env.validation';
import { PrismaService } from '../src/prisma/prisma.service';
import { createEngineSearch } from '../src/search/golden/engine-search';
import { loadGoldenSet } from '../src/search/golden/load-golden';
import { evaluateGolden, formatReport } from '../src/search/golden/metrics';
import { CorpusLoader } from '../src/search/index/corpus-loader.service';
import {
  buildSnapshot,
  type SearchIndexService,
  type SearchSnapshot,
} from '../src/search/index/search-index.service';
import { tokenize } from '../src/search/index/tokenize';
import { areKeyboardNeighbours } from '../src/search/text/edit-distance';
import { SearchService } from '../src/search/search.service';

/** Deterministic PRNG (mulberry32) so the samples are reproducible. */
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

const LETTERS = [...'ابتثجحخدذرزسشصضطظعغفقكلمنهوي'];
/** claude.md 5.3 phonetic groups, as letter pairs a user/STT confuses. */
const CONFUSABLE: Record<string, string[]> = {
  س: ['ص', 'ث'],
  ص: ['س'],
  ث: ['س'],
  ز: ['ذ', 'ظ'],
  ذ: ['ز'],
  ظ: ['ز', 'ض'],
  ض: ['د', 'ظ'],
  د: ['ض'],
  ت: ['ط'],
  ط: ['ت'],
  ق: ['ك'],
  ك: ['ق'],
  ح: ['ه'],
  ه: ['ح'],
  ع: ['ا'],
};
const TYPO_KINDS = ['delete', 'transpose', 'keyboard', 'confusable', 'double'] as const;
type TypoKind = (typeof TYPO_KINDS)[number];

function makeTypo(word: string, kind: TypoKind, rand: () => number): string | null {
  const chars = [...word];
  const pick = (from: number[]) => (from.length ? from[Math.floor(rand() * from.length)] : -1);
  const positions = chars.map((_, i) => i).filter((i) => i > 0); // keep the first letter
  switch (kind) {
    case 'delete': {
      const i = pick(positions);
      return chars.filter((_, k) => k !== i).join('');
    }
    case 'transpose': {
      const i = pick(positions.filter((k) => k + 1 < chars.length && chars[k] !== chars[k + 1]));
      if (i < 0) return null;
      [chars[i], chars[i + 1]] = [chars[i + 1], chars[i]];
      return chars.join('');
    }
    case 'keyboard': {
      const i = pick(
        positions.filter((k) => LETTERS.some((l) => areKeyboardNeighbours(chars[k], l))),
      );
      if (i < 0) return null;
      const options = LETTERS.filter((l) => areKeyboardNeighbours(chars[i], l));
      chars[i] = options[Math.floor(rand() * options.length)];
      return chars.join('');
    }
    case 'confusable': {
      const i = pick(chars.map((_, k) => k).filter((k) => CONFUSABLE[chars[k]]));
      if (i < 0) return null;
      const options = CONFUSABLE[chars[i]];
      chars[i] = options[Math.floor(rand() * options.length)];
      return chars.join('');
    }
    case 'double': {
      const i = pick(positions.filter((k) => chars[k] !== chars[k - 1]));
      if (i < 0) return null;
      chars.splice(i, 0, chars[i]);
      return chars.join('');
    }
  }
}

function percentile(sorted: number[], p: number): number {
  return sorted[Math.floor(p * (sorted.length - 1))];
}

describe('token corrector on the real corpus (read-only)', () => {
  let prisma: PrismaService;
  let snapshot: SearchSnapshot;
  let service: SearchService;
  const golden = loadGoldenSet();

  beforeAll(async () => {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('needs DATABASE_URL from apps/backend/.env');
    prisma = new PrismaService(new ConfigService<EnvVars, true>({ DATABASE_URL: url }));
    await prisma.onModuleInit();
    const loader = new CorpusLoader(prisma);
    snapshot = buildSnapshot(await loader.load(), await loader.loadSuras());
    service = new SearchService({
      currentSnapshot: () => snapshot,
    } as unknown as SearchIndexService);
  });

  afterAll(async () => {
    await prisma?.onModuleDestroy();
  });

  it('rule 5.1: no vocabulary word is ever changed (every word + 2000 ayah fragments)', () => {
    const { index } = snapshot;
    const changed: string[] = [];
    for (const { word } of index.vocabulary.entries()) {
      const out = service.search(word, { limit: 1 });
      if (out.corrected !== null || out.total === 0) changed.push(word);
    }
    const rand = prng(31);
    let fragments = 0;
    for (let i = 0; i < 2000; i++) {
      const d = Math.floor(rand() * index.docCount);
      const words = index.docTokens(d);
      const n = Math.min(words.length, 1 + Math.floor(rand() * 5));
      const start = Math.floor(rand() * (words.length - n + 1));
      const q = words.slice(start, start + n).join(' ');
      const out = service.search(q, { limit: 1 });
      fragments++;
      if (out.corrected !== null || out.total === 0) changed.push(q);
    }
    process.stdout.write(
      `rule 5.1: ${index.vocabulary.size} vocabulary words + ${fragments} fragments, ` +
        `wrongly corrected: ${changed.length}\n`,
    );
    expect(changed).toEqual([]);
  }, 120_000);

  it('clean golden cases are never corrected', () => {
    const corrected = golden
      .filter((c) => c.tier === 'clean')
      .filter((c) => service.search(c.q).corrected !== null)
      .map((c) => c.id);
    expect(corrected).toEqual([]);
  });

  it('typo tier: Recall@5 >= 90% and the applied correction text', async () => {
    const typo = golden.filter((c) => c.tier === 'typo');
    const report = await evaluateGolden(typo, createEngineSearch(service));
    process.stdout.write(`\n${formatReport(report, 'Phase 3: typo tier')}\n`);
    const exact = typo.filter(
      (c) => service.search(c.q).corrected?.text === normalize(c.intended ?? ''),
    );
    process.stdout.write(
      `typo tier: corrected text == intended for ${exact.length}/${typo.length}: ` +
        `${typo
          .filter((c) => !exact.includes(c))
          .map((c) => `${c.id} -> ${service.search(c.q).corrected?.text ?? 'none'}`)
          .join(' | ')}\n\n`,
    );
    expect(report.overall.recallAt[5]).toBeGreaterThanOrEqual(0.9);
    // Every typo case is corrected (each has an OOV word and an ayah to find).
    expect(typo.every((c) => service.search(c.q).corrected?.applied)).toBe(true);
  });

  it('1000 synthetic typos: recall by kind, corrections and latency', () => {
    const { index } = snapshot;
    const rand = prng(7);
    const stats = new Map<TypoKind, { n: number; at1: number; at5: number; exact: number }>();
    const latencies: number[] = [];
    const missed: string[] = [];
    let attempts = 0;
    let total = 0;
    while (total < 1000 && attempts < 20_000) {
      attempts++;
      const d = Math.floor(rand() * index.docCount);
      const words = index.docTokens(d);
      if (words.length < 2) continue;
      const n = 2 + Math.floor(rand() * Math.min(3, words.length - 1));
      const start = Math.floor(rand() * (words.length - n + 1));
      const fragment = words.slice(start, start + n);
      // Typos go into a word of >= 5 letters, so the typo word keeps >= 4 (claude.md 5.5:
      // no fuzzy matching up to 3 letters).
      const targets = fragment.map((w, i) => ({ w, i })).filter(({ w }) => w.length >= 5);
      if (targets.length === 0) continue;
      const { w, i } = targets[Math.floor(rand() * targets.length)];
      const kind = TYPO_KINDS[total % TYPO_KINDS.length];
      const typo = makeTypo(w, kind, rand);
      if (!typo || typo !== normalize(typo) || index.vocabulary.has(typo)) continue;
      const q = [...fragment.slice(0, i), typo, ...fragment.slice(i + 1)].join(' ');

      const t0 = performance.now();
      const out = service.search(q, { limit: 5 });
      latencies.push(performance.now() - t0);
      const refs = out.results.map((r) => r.ref);
      const s = stats.get(kind) ?? { n: 0, at1: 0, at5: 0, exact: 0 };
      s.n++;
      // Scored like the golden typo tier: expected = every ayah containing the original
      // fragment (a refrain such as "فباي الاء ربكما تكذبان" is in 31 ayahs, any is right).
      const expected = new Set(index.findPhrase(fragment).map((m) => index.doc(m.docIndex).ref));
      if (expected.has(refs[0])) s.at1++;
      const found = refs.filter((r) => expected.has(r)).length;
      s.at5 += found / Math.min(expected.size, 5);
      if (found === 0 && missed.length < 15) missed.push(`${kind}: ${q} (${index.doc(d).ref})`);
      if (out.corrected?.text === fragment.join(' ')) s.exact++;
      stats.set(kind, s);
      total++;
    }
    const sum = [...stats.values()].reduce(
      (a, b) => ({
        n: a.n + b.n,
        at1: a.at1 + b.at1,
        at5: a.at5 + b.at5,
        exact: a.exact + b.exact,
      }),
      { n: 0, at1: 0, at5: 0, exact: 0 },
    );
    const pct = (x: number, n: number) => `${((100 * x) / n).toFixed(1)}%`;
    const lines = [...stats].map(
      ([k, s]) =>
        `  ${k.padEnd(10)} n=${s.n} R@1=${pct(s.at1, s.n)} R@5=${pct(s.at5, s.n)} ` +
        `correction==original ${pct(s.exact, s.n)}`,
    );
    latencies.sort((a, b) => a - b);
    process.stdout.write(
      `synthetic typos (${sum.n}): R@1=${pct(sum.at1, sum.n)} R@5=${pct(sum.at5, sum.n)} ` +
        `correction==original ${pct(sum.exact, sum.n)}\n${lines.join('\n')}\n` +
        `latency ms p50=${percentile(latencies, 0.5).toFixed(2)} ` +
        `p95=${percentile(latencies, 0.95).toFixed(2)} max=${percentile(latencies, 1).toFixed(2)}\n` +
        `sample misses: ${missed.join(' | ')}\n`,
    );
    expect(sum.n).toBe(1000);
    // Regression floor, not the target: the Phase 3 target is measured on the golden typo tier.
    expect(sum.at5 / sum.n).toBeGreaterThanOrEqual(0.85);
    expect(percentile(latencies, 0.95)).toBeLessThan(30); // claude.md 5.11
  }, 120_000);

  it('cache (claude.md 5.11): measured latency of repeated queries', () => {
    // A fresh service so nothing is cached yet; typo-tier queries are the costly ones.
    const fresh = new SearchService({
      currentSnapshot: () => snapshot,
    } as unknown as SearchIndexService);
    const queries = golden.filter((c) => c.tier === 'typo').map((c) => c.q);
    const time = (q: string) => {
      const t0 = performance.now();
      fresh.search(q, { limit: 20 });
      return performance.now() - t0;
    };
    const cold = queries.map(time).sort((a, b) => a - b);
    const warm = queries.map(time).sort((a, b) => a - b);
    process.stdout.write(
      `cache: ${queries.length} typo queries, uncached p50=${percentile(cold, 0.5).toFixed(3)}ms ` +
        `p95=${percentile(cold, 0.95).toFixed(3)}ms | cached p50=${percentile(warm, 0.5).toFixed(3)}ms ` +
        `p95=${percentile(warm, 0.95).toFixed(3)}ms | ${JSON.stringify(fresh.cacheStats())}\n`,
    );
    expect(fresh.cacheStats().hits).toBe(queries.length);
    expect(percentile(warm, 0.5)).toBeLessThan(percentile(cold, 0.5));
  });

  it('"هل تقصد" suggestions are only offered for vocabulary-only queries and always find ayahs', () => {
    const { index } = snapshot;
    const rand = prng(11);
    const words = index.vocabulary.entries().map((e) => e.word);
    let offered = 0;
    let checked = 0;
    for (let i = 0; i < 400; i++) {
      // Two random vocabulary words: usually no ayah holds both.
      const q = `${words[Math.floor(rand() * words.length)]} ${words[Math.floor(rand() * words.length)]}`;
      const out = service.search(q, { limit: 1 });
      if (out.total > 0) continue;
      checked++;
      expect(out.corrected).toBeNull();
      for (const s of out.didYouMean ?? []) {
        offered++;
        expect(service.search(s, { limit: 1 }).total).toBeGreaterThan(0);
        expect(tokenize(s)).toHaveLength(tokenize(q).length);
      }
    }
    process.stdout.write(`did-you-mean: ${checked} empty queries, ${offered} suggestions\n`);
    expect(checked).toBeGreaterThan(0);
  });
});
