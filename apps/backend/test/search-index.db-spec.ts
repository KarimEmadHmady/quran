/**
 * S2 integration: the inverted index built from the REAL corpus (read-only; part of
 * `npm run test:db` and `npm run search:eval`).
 *  - builds through the real CorpusLoader, with Prisma guarded so only `ayah` can be read
 *  - verifies docs, tokens, postings and vocabulary/IDF against the raw data
 *  - proves index phrase search == the S1 linear-scan baseline (every golden query + 3000 random phrases)
 *  - prints golden metrics and per-query timings for both
 */
import { ConfigService } from '@nestjs/config';
import type { EnvVars } from '../src/config/env.validation';
import { PrismaService } from '../src/prisma/prisma.service';
import { createIndexPhraseSearch } from '../src/search/golden/index-phrase-search';
import { loadGoldenSet } from '../src/search/golden/load-golden';
import { evaluateGolden, formatReport, type SearchFn } from '../src/search/golden/metrics';
import { createPhraseBaseline } from '../src/search/golden/phrase-baseline';
import { CorpusLoader } from '../src/search/index/corpus-loader.service';
import { InvertedIndex, type CorpusDoc } from '../src/search/index/inverted-index';
import { tokenize } from '../src/search/index/tokenize';

/** Deterministic PRNG (mulberry32) so the random sample is reproducible. */
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

/** Exact bytes of the index's typed arrays (docs, posStart, positions, per-doc term ids). */
function typedArrayMb(s: { terms: number; tokens: number; postings: number }): number {
  const bytes = s.postings * 4 + (s.postings + s.terms) * 4 + s.tokens * 2 + s.tokens * 4;
  return bytes / 1024 / 1024;
}

async function timePerQuery(search: SearchFn, queries: readonly string[], rounds = 5) {
  const start = performance.now();
  for (let r = 0; r < rounds; r++) for (const q of queries) await search(q, 'text');
  return (performance.now() - start) / (rounds * queries.length);
}

describe('inverted index on the real corpus (read-only)', () => {
  let prisma: PrismaService;
  let corpus: CorpusDoc[];
  let index: InvertedIndex;
  let buildMs: number;
  const touchedModels = new Set<string>();
  const golden = loadGoldenSet();

  beforeAll(async () => {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('needs DATABASE_URL from apps/backend/.env');
    prisma = new PrismaService(new ConfigService<EnvVars, true>({ DATABASE_URL: url }));
    await prisma.onModuleInit();

    // Record every model the loader touches; anything but `ayah` throws.
    const guarded = new Proxy(prisma, {
      get(target, prop, receiver) {
        if (typeof prop === 'string' && !prop.startsWith('$') && !prop.startsWith('_')) {
          touchedModels.add(prop);
          if (prop !== 'ayah') throw new Error(`index loader touched prisma.${prop}`);
        }
        return Reflect.get(target, prop, receiver) as unknown;
      },
    });

    corpus = await new CorpusLoader(guarded).load();
    const t0 = performance.now();
    index = InvertedIndex.build(corpus);
    buildMs = performance.now() - t0;
  });

  afterAll(async () => {
    await prisma?.onModuleDestroy();
  });

  it('reads only the ayahs table (never tafsirs)', () => {
    expect([...touchedModels]).toEqual(['ayah']);
  });

  it('indexes all 6236 ayahs in mushaf order with unique refs', () => {
    expect(index.docCount).toBe(6236);
    expect(corpus.every((d, i) => d.ayahId === i + 1)).toBe(true);
    expect(index.doc(0).ref).toBe('1:1');
    expect(index.doc(6235).ref).toBe('114:6');
    expect(new Set(corpus.map((_, i) => index.doc(i).ref)).size).toBe(6236);
  });

  it('token count of every ayah equals its text_simple word count (needed for S3 alignment)', () => {
    const mismatched = corpus
      .filter((d, i) => index.doc(i).length !== d.textSimple.trim().split(/\s+/).length)
      .map((d) => `${d.suraNumber}:${d.ayahNumber}`);
    expect(mismatched).toEqual([]);
  });

  it('stored tokens equal tokenize(text_simple) for every ayah', () => {
    const bad = corpus.filter(
      (d, i) => index.docTokens(i).join(' ') !== tokenize(d.textSimple).join(' '),
    );
    expect(bad).toHaveLength(0);
  });

  it('vocabulary: df/cf/postings are consistent and IDF ranks rare words above common ones', () => {
    const entries = index.vocabulary.entries();
    const stats = index.stats();
    expect(entries.length).toBe(stats.terms);
    expect(entries.reduce((n, e) => n + e.cf, 0)).toBe(stats.tokens);
    expect(entries.reduce((n, e) => n + e.df, 0)).toBe(stats.postings);
    expect(entries.every((e) => e.df >= 1 && e.df <= e.cf && e.df <= 6236 && e.idf > 0)).toBe(true);

    // Spot checks against the raw text.
    for (const word of ['الله', 'الرحمن', 'الصمد', 'من']) {
      const expectedDf = corpus.filter((d) => tokenize(d.textSimple).includes(word)).length;
      expect([word, index.vocabulary.get(word)?.df]).toEqual([word, expectedDf]);
    }
    const idf = (w: string) => index.vocabulary.get(w)?.idf ?? NaN;
    expect(idf('الصمد')).toBeGreaterThan(idf('الرحمن'));
    expect(idf('الرحمن')).toBeGreaterThan(idf('الله'));
    expect(idf('من')).toBeLessThan(idf('الرحمن'));
  });

  it('positions point at the right tokens (every posting of every term)', () => {
    let checked = 0;
    for (const e of index.vocabulary.entries()) {
      for (const docIndex of index.postings(e.word)) {
        const tokens = index.docTokens(docIndex);
        for (const pos of index.positions(e.word, docIndex)) {
          if (tokens[pos] !== e.word) throw new Error(`bad position ${e.word}@${docIndex}:${pos}`);
          checked++;
        }
      }
    }
    expect(checked).toBe(index.stats().tokens);
  });

  it('index phrase search == baseline on every golden query', async () => {
    const baseline = createPhraseBaseline(
      corpus.map((d, i) => ({ ref: index.doc(i).ref, textSimple: d.textSimple })),
    );
    const indexed = createIndexPhraseSearch(index);
    const differing: string[] = [];
    for (const c of golden) {
      const [a, b] = await Promise.all([baseline(c.q, c.type), indexed(c.q, c.type)]);
      if (JSON.stringify(a) !== JSON.stringify(b)) differing.push(c.id);
    }
    expect(differing).toEqual([]);
  });

  it('index phrase search == baseline on 3000 random phrases sampled from the corpus', async () => {
    const baseline = createPhraseBaseline(
      corpus.map((d, i) => ({ ref: index.doc(i).ref, textSimple: d.textSimple })),
    );
    const indexed = createIndexPhraseSearch(index);
    const rand = prng(20261112);
    const differing: string[] = [];
    let found = 0;
    for (let n = 0; n < 3000; n++) {
      const docIndex = Math.floor(rand() * index.docCount);
      const tokens = index.docTokens(docIndex);
      const len = 1 + Math.floor(rand() * Math.min(6, tokens.length));
      const start = Math.floor(rand() * (tokens.length - len + 1));
      const q = tokens.slice(start, start + len).join(' ');
      const [a, b] = await Promise.all([baseline(q, 'text'), indexed(q, 'text')]);
      if (JSON.stringify(a) !== JSON.stringify(b)) differing.push(q);
      if (b.some((h) => h.ref === index.doc(docIndex).ref)) found++;
    }
    expect(differing).toEqual([]);
    expect(found).toBe(3000); // the source ayah is always among the results
  });

  it('golden metrics and timings: index vs baseline', async () => {
    const baseline = createPhraseBaseline(
      corpus.map((d, i) => ({ ref: index.doc(i).ref, textSimple: d.textSimple })),
    );
    const indexed = createIndexPhraseSearch(index);
    const [baseReport, indexReport] = [
      await evaluateGolden(golden, baseline),
      await evaluateGolden(golden, indexed),
    ];
    // Same results per case, so the same metrics.
    expect(indexReport.results.map((r) => r.top)).toEqual(baseReport.results.map((r) => r.top));
    expect(indexReport.overall).toEqual(baseReport.overall);

    const queries = golden.map((c) => c.q);
    const baseMs = await timePerQuery(baseline, queries);
    const indexMs = await timePerQuery(indexed, queries);
    const s = index.stats();
    process.stdout.write(
      [
        '',
        formatReport(indexReport, 'S2: inverted index (exact phrase)'),
        '',
        `index: ${s.docs} docs, ${s.terms} terms, ${s.tokens} tokens, ${s.postings} postings, ` +
          `avg ${s.avgDocLength.toFixed(1)} / max ${s.maxDocLength} tokens per ayah`,
        `build: ${buildMs.toFixed(0)} ms; typed arrays ${typedArrayMb(s).toFixed(2)} MB ` +
          '(postings + positions + per-ayah term ids; JS maps/strings not counted)',
        `per query (golden, 5 rounds): baseline ${baseMs.toFixed(3)} ms, index ${indexMs.toFixed(3)} ms ` +
          `(${(baseMs / indexMs).toFixed(0)}x faster)`,
        '',
      ].join('\n'),
    );
    expect(indexMs).toBeLessThan(baseMs);
    expect(indexMs).toBeLessThan(5); // claude.md 5.11 target is < 30 ms for the whole search
  });
});
