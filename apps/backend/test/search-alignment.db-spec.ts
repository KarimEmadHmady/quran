/**
 * S3: word alignment (text_simple word -> text_uthmani range) verified on the ENTIRE real
 * corpus (read-only; part of `npm run test:db` and `npm run search:eval`). Every ayah, every
 * word: nothing is sampled.
 */
import { ConfigService } from '@nestjs/config';
import { normalize } from '@quran/text-utils';
import type { EnvVars } from '../src/config/env.validation';
import { PrismaService } from '../src/prisma/prisma.service';
import { loadGoldenSet } from '../src/search/golden/load-golden';
import {
  alignAyah,
  letterKey,
  levenshtein,
  skeleton,
  validateAlignment,
} from '../src/search/index/alignment';
import {
  KNOWN_ALIGNMENT_CASES,
  SPELLING_DIFFERENCES_IN_MERGES,
  VOCATIVE_MERGE_AYAHS,
  VOCATIVE_SIMPLE_WORD,
} from '../src/search/index/alignment-exceptions';
import { AlignmentMap } from '../src/search/index/alignment-map';
import { CorpusLoader, type CorpusAyah } from '../src/search/index/corpus-loader.service';
import { InvertedIndex } from '../src/search/index/inverted-index';

const ref = (a: CorpusAyah) => `${a.suraNumber}:${a.ayahNumber}`;
const words = (s: string) => s.trim().split(/\s+/);
const keyDistance = (a: string, b: string) => levenshtein(a, b) / Math.max(a.length, b.length, 1);

describe('word alignment on the entire real corpus (read-only)', () => {
  let prisma: PrismaService;
  let corpus: CorpusAyah[];
  let map: AlignmentMap;
  let index: InvertedIndex;
  let buildMs: number;
  const touchedModels = new Set<string>();

  beforeAll(async () => {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('needs DATABASE_URL from apps/backend/.env');
    prisma = new PrismaService(new ConfigService<EnvVars, true>({ DATABASE_URL: url }));
    await prisma.onModuleInit();
    const guarded = new Proxy(prisma, {
      get(target, prop, receiver) {
        if (typeof prop === 'string' && !prop.startsWith('$') && !prop.startsWith('_')) {
          touchedModels.add(prop);
          if (prop !== 'ayah') throw new Error(`loader touched prisma.${prop}`);
        }
        return Reflect.get(target, prop, receiver) as unknown;
      },
    });
    corpus = await new CorpusLoader(guarded).load();
    const t0 = performance.now();
    map = AlignmentMap.build(corpus);
    buildMs = performance.now() - t0;
    index = InvertedIndex.build(corpus);
  });

  afterAll(async () => {
    await prisma?.onModuleDestroy();
  });

  it('reads only the ayahs table (never tafsirs)', () => {
    expect([...touchedModels]).toEqual(['ayah']);
  });

  it('UTF-16 safety: no surrogate pairs, so String.slice offsets == code point offsets', () => {
    const withSurrogates = corpus.filter((a) => {
      for (let i = 0; i < a.textUthmani.length; i++) {
        const c = a.textUthmani.charCodeAt(i);
        if (c >= 0xd800 && c <= 0xdfff) return true;
      }
      return false;
    });
    expect(withSurrogates.map(ref)).toEqual([]);
    expect(corpus.every((a) => Array.from(a.textUthmani).length === a.textUthmani.length)).toBe(
      true,
    );
  });

  it('every simple word of all 6236 ayahs has a valid, non-empty, ordered Uthmani range', () => {
    const problems: string[] = [];
    let wordsChecked = 0;
    corpus.forEach((a, i) => {
      const al = map.get(i);
      if (al.simpleCount !== index.doc(i).length) problems.push(`${ref(a)}: count != index tokens`);
      for (const p of validateAlignment(al, a.textUthmani)) problems.push(`${ref(a)}: ${p}`);
      wordsChecked += al.spans.length;
    });
    expect(problems).toEqual([]);
    expect(wordsChecked).toBe(77_797);
    expect(map.stats()).toEqual({
      ayahs: 6236,
      positional: 6236 - 364,
      dp: 364,
      fallback: 0,
      mergedWords: 344 + 16 * 1 + 3 * 2 + 0, // see alignment-exceptions.ts
      unmappedUthmaniWords: 4,
      invalid: 0,
    });
  });

  it('the positional shortcut equals the full DP on every equal-count ayah', () => {
    const differing: string[] = [];
    corpus.forEach((a, i) => {
      const fast = map.get(i);
      if (fast.method !== 'positional') return;
      const dp = alignAyah(a.textSimple, a.textUthmani, { forceDp: true });
      if (JSON.stringify(dp.spans) !== JSON.stringify(fast.spans)) differing.push(ref(a));
    });
    expect(differing).toEqual([]);
  }, 120_000);

  it('the DP band never changes a result: banded == unbanded on all 364 aligned ayahs', () => {
    const differing: string[] = [];
    corpus.forEach((a, i) => {
      if (map.get(i).method !== 'dp') return;
      const full = alignAyah(a.textSimple, a.textUthmani, { band: Infinity });
      if (JSON.stringify(full) !== JSON.stringify(map.get(i))) differing.push(ref(a));
    });
    expect(differing).toEqual([]);
  }, 120_000);

  it('DP runs exactly on the 364 ayahs whose word counts differ', () => {
    const mismatched = corpus
      .filter((a) => words(a.textSimple).length !== words(a.textUthmani).length)
      .map(ref);
    const dp = corpus.filter((_, i) => map.get(i).method === 'dp').map(ref);
    expect(mismatched).toHaveLength(364);
    expect(dp).toEqual(mismatched);
  });

  it(`${VOCATIVE_MERGE_AYAHS} ayahs: exactly one vocative merge ("يا" + next word), nothing else`, () => {
    const known = new Set(KNOWN_ALIGNMENT_CASES.map((c) => c.ref));
    const bad: string[] = [];
    let vocatives = 0;
    corpus.forEach((a, i) => {
      const al = map.get(i);
      if (al.method !== 'dp' || known.has(ref(a))) return;
      const [m] = al.merges;
      const ok =
        al.merges.length === 1 &&
        m.simpleCount === 2 &&
        al.unmappedUthmani.length === 0 &&
        normalize(words(a.textSimple)[m.simpleStart]) === VOCATIVE_SIMPLE_WORD;
      if (ok) vocatives++;
      else bad.push(ref(a));
    });
    expect(bad).toEqual([]);
    expect(vocatives).toBe(VOCATIVE_MERGE_AYAHS);
  });

  it.each(KNOWN_ALIGNMENT_CASES.map((c) => [c.ref, c.pattern, c] as const))(
    'documented case %s (%s) aligns exactly as specified',
    (r, _pattern, expected) => {
      const i = corpus.findIndex((a) => ref(a) === r);
      const al = map.get(i);
      expect(al.method).toBe('dp');
      expect(al.merges.map((m) => [m.simpleStart, m.simpleCount, m.uthmaniIndex])).toEqual(
        expected.merges,
      );
      expect(al.unmappedUthmani).toEqual(expected.unmappedUthmani);
    },
  );

  it('97:1: the basmala in text_uthmani is unmapped and ayah words start after it', () => {
    const i = corpus.findIndex((a) => ref(a) === '97:1');
    const a = corpus[i];
    const al = map.get(i);
    const uWords = words(a.textUthmani);
    expect(uWords.slice(0, 4).map(normalize).join(' ')).toBe(normalize('بسم الله الرحمن الرحيم'));
    expect(al.uthmaniIndexOf).toEqual([4, 5, 6, 7, 8]);
    expect(a.textUthmani.slice(al.spans[0].start, al.spans[0].end)).toBe(uWords[4]);
  });

  it('content check: every mapping is plausibly the same word', () => {
    let worstSingle = { d: 0, at: '' };
    let worstPart = { d: 0, at: '' };
    const partsAtDistance2: string[] = [];
    corpus.forEach((a, i) => {
      const al = map.get(i);
      const sw = words(a.textSimple);
      const merged = new Set(
        al.merges.flatMap((m) =>
          Array.from({ length: m.simpleCount }, (_, k) => m.simpleStart + k),
        ),
      );
      al.spans.forEach((s, w) => {
        const slice = a.textUthmani.slice(s.start, s.end);
        if (merged.has(w)) {
          const d = levenshtein(letterKey(slice), letterKey(sw[w]));
          if (d > worstPart.d) worstPart = { d, at: `${ref(a)}#${w}` };
          if (d >= 2) partsAtDistance2.push(`${ref(a)}#${w}`);
        } else {
          const d = keyDistance(skeleton(slice), skeleton(sw[w]));
          if (d > worstSingle.d) worstSingle = { d, at: `${ref(a)}#${w}` };
        }
      });
    });
    process.stdout.write(
      `\nworst 1:1 skeleton distance ${worstSingle.d.toFixed(2)} at ${worstSingle.at}; ` +
        `worst merged-part letter distance ${worstPart.d} at ${worstPart.at}\n`,
    );
    expect(worstSingle.d).toBeLessThanOrEqual(0.67); // spelling variants, e.g. 27:36
    expect(worstPart.d).toBeLessThanOrEqual(2);
    // Distance 1 is normal ("يا" -> "يَٰ": the alef is a mark). Distance 2 only where the
    // Uthmani spelling itself differs; those are documented one by one.
    expect(partsAtDistance2).toEqual(SPELLING_DIFFERENCES_IN_MERGES);
  });

  it('end to end: highlighting every golden phrase match spells the query in Uthmani', () => {
    const golden = loadGoldenSet().filter(
      (c) => c.category !== 'reference' && c.category !== 'negative',
    );
    let checked = 0;
    let worst = { d: 0, at: '' };
    for (const c of golden) {
      const queryKey = skeleton(c.q);
      const len = normalize(c.q).split(' ').length;
      for (const m of index.findPhraseText(c.q)) {
        for (const start of m.starts) {
          const positions = Array.from({ length: len }, (_, k) => start + k);
          const ranges = map.rangesFor(m.docIndex, positions);
          expect(ranges).toHaveLength(1); // a phrase is one continuous highlight
          const text = corpus[m.docIndex].textUthmani.slice(ranges[0].start, ranges[0].end);
          const d = keyDistance(skeleton(text), queryKey);
          if (d > worst.d) worst = { d, at: `${c.id}@${index.doc(m.docIndex).ref}` };
          checked++;
        }
      }
    }
    process.stdout.write(
      `highlight check: ${checked} phrase occurrences, worst skeleton distance ${worst.d.toFixed(2)}${worst.at ? ` at ${worst.at}` : ''}\n`,
    );
    expect(checked).toBeGreaterThan(200);
    expect(worst.d).toBeLessThanOrEqual(0.2);
  });

  it('builds fast enough for startup', () => {
    process.stdout.write(`alignment build: ${buildMs.toFixed(0)} ms for ${map.size} ayahs\n\n`);
    expect(buildMs).toBeLessThan(1000); // measured ~330 ms; one-time and non-blocking at startup
  });
});
