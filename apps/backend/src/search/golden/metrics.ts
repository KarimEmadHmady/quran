import type { GoldenCase, QueryType } from './golden-set';

export type Confidence = 'high' | 'medium' | 'low';

/** What any search implementation must return for evaluation: ranked "sura:ayah" refs. */
export interface SearchHit {
  ref: string;
  confidence?: Confidence;
}

export type SearchFn = (q: string, type: QueryType) => Promise<readonly SearchHit[]>;

export interface MetricSummary {
  cases: number;
  /** k -> mean Recall@k */
  recallAt: Record<number, number>;
  mrr: number;
}

export interface CaseResult {
  id: string;
  q: string;
  category: GoldenCase['category'];
  tier: GoldenCase['tier'];
  expected: string[];
  /** First 10 refs returned (deduplicated, ranked). */
  top: string[];
  recallAt: Record<number, number>;
  reciprocalRank: number;
  /** Negative cases only: true when a non-"low" result came back. */
  confidentFalsePositive?: boolean;
}

export interface EvalReport {
  ks: number[];
  overall: MetricSummary;
  byCategory: Record<string, MetricSummary>;
  byTier: Record<string, MetricSummary>;
  negatives: { cases: number; confidentFalsePositives: number };
  results: CaseResult[];
}

/** Keeps the first occurrence of each ref, in rank order. */
export function dedupeRanked(refs: readonly string[]): string[] {
  return [...new Set(refs)];
}

/**
 * |expected ∩ top-k| / min(|expected|, k). With one expected ayah this is hit@k; with many
 * (e.g. a refrain repeated 31 times) a perfect top-k scores 1.
 */
export function recallAtK(
  expected: readonly string[],
  ranked: readonly string[],
  k: number,
): number {
  if (expected.length === 0) throw new Error('recallAtK needs at least one expected ref');
  const want = new Set(expected);
  const hits = dedupeRanked(ranked)
    .slice(0, k)
    .filter((r) => want.has(r)).length;
  return hits / Math.min(want.size, k);
}

/** 1 / rank of the first relevant result; 0 when none is returned. */
export function reciprocalRank(expected: readonly string[], ranked: readonly string[]): number {
  const want = new Set(expected);
  const index = dedupeRanked(ranked).findIndex((r) => want.has(r));
  return index === -1 ? 0 : 1 / (index + 1);
}

function summarize(results: readonly CaseResult[], ks: readonly number[]): MetricSummary {
  const n = results.length;
  const mean = (f: (r: CaseResult) => number) =>
    n === 0 ? 0 : results.reduce((sum, r) => sum + f(r), 0) / n;
  return {
    cases: n,
    recallAt: Object.fromEntries(ks.map((k) => [k, mean((r) => r.recallAt[k])])),
    mrr: mean((r) => r.reciprocalRank),
  };
}

function groupBy(results: readonly CaseResult[], key: (r: CaseResult) => string) {
  const groups = new Map<string, CaseResult[]>();
  for (const r of results) groups.set(key(r), [...(groups.get(key(r)) ?? []), r]);
  return groups;
}

/** Runs every case through `search` and computes Recall@k, MRR and negative-case failures. */
export async function evaluateGolden(
  cases: readonly GoldenCase[],
  search: SearchFn,
  ks: readonly number[] = [1, 5],
): Promise<EvalReport> {
  const results: CaseResult[] = [];
  for (const c of cases) {
    const hits = await search(c.q, c.type);
    const ranked = dedupeRanked(hits.map((h) => h.ref));
    const base = {
      id: c.id,
      q: c.q,
      category: c.category,
      tier: c.tier,
      expected: c.expected,
      top: ranked.slice(0, 10),
    };
    if (c.category === 'negative') {
      const confident = hits.some((h) => h.confidence !== 'low');
      results.push({ ...base, recallAt: {}, reciprocalRank: 0, confidentFalsePositive: confident });
      continue;
    }
    results.push({
      ...base,
      recallAt: Object.fromEntries(ks.map((k) => [k, recallAtK(c.expected, ranked, k)])),
      reciprocalRank: reciprocalRank(c.expected, ranked),
    });
  }

  const positives = results.filter((r) => r.category !== 'negative');
  const negatives = results.filter((r) => r.category === 'negative');
  const byKey = (key: (r: CaseResult) => string) =>
    Object.fromEntries([...groupBy(positives, key)].map(([k, rs]) => [k, summarize(rs, ks)]));
  return {
    ks: [...ks],
    overall: summarize(positives, ks),
    byCategory: byKey((r) => r.category),
    byTier: byKey((r) => r.tier),
    negatives: {
      cases: negatives.length,
      confidentFalsePositives: negatives.filter((r) => r.confidentFalsePositive).length,
    },
    results,
  };
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`.padStart(6);

/** Plain-text report (ASCII only, so terminals that reorder Arabic stay readable). */
export function formatReport(report: EvalReport, title = 'Golden set'): string {
  const head = `${'group'.padEnd(20)} ${'n'.padStart(3)} ${report.ks.map((k) => `R@${k}`.padStart(6)).join(' ')}    MRR`;
  const row = (name: string, s: MetricSummary) =>
    `${name.padEnd(20)} ${String(s.cases).padStart(3)} ${report.ks.map((k) => pct(s.recallAt[k])).join(' ')} ${pct(s.mrr)}`;
  const misses = report.results.filter(
    (r) =>
      r.confidentFalsePositive ||
      (r.category !== 'negative' && r.recallAt[report.ks[report.ks.length - 1]] < 1),
  );
  return [
    `== ${title} ==`,
    head,
    row('OVERALL', report.overall),
    ...Object.entries(report.byTier).map(([k, s]) => row(`tier:${k}`, s)),
    ...Object.entries(report.byCategory).map(([k, s]) => row(k, s)),
    `negatives: ${report.negatives.cases} cases, ${report.negatives.confidentFalsePositives} confident false positives`,
    `not perfect at R@${report.ks[report.ks.length - 1]}: ${misses.length ? misses.map((r) => r.id).join(', ') : 'none'}`,
  ].join('\n');
}
