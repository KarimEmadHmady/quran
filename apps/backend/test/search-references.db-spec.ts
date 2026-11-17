/**
 * S4 integration: reference search on the REAL corpus (read-only; part of `npm run test:db`
 * and `npm run search:eval`).
 *  - loadSuras() reads only `suras`; the live table equals test/support/suras.fixture.ts
 *  - the sura catalog builds against the real index (ayah_count == indexed ayahs, 114 suras)
 *  - every sura resolves by name / "سورة" + name / name + last ayah / number:last ayah
 *  (golden metrics and stage checks: test/search-engine.db-spec.ts)
 */
import { ConfigService } from '@nestjs/config';
import type { EnvVars } from '../src/config/env.validation';
import { PrismaService } from '../src/prisma/prisma.service';
import { createPhraseBaseline } from '../src/search/golden/phrase-baseline';
import { CorpusLoader } from '../src/search/index/corpus-loader.service';
import { buildSnapshot, type SearchIndexService } from '../src/search/index/search-index.service';
import type { SuraInfo } from '../src/search/query/sura-catalog';
import { SearchService } from '../src/search/search.service';
import { SURAS_FIXTURE } from './support/suras.fixture';

describe('reference search on the real corpus (read-only)', () => {
  let prisma: PrismaService;
  let suras: SuraInfo[];
  let service: SearchService;
  let docs: { ref: string; textSimple: string }[];
  const touched = new Set<string>();

  beforeAll(async () => {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('needs DATABASE_URL from apps/backend/.env');
    prisma = new PrismaService(new ConfigService<EnvVars, true>({ DATABASE_URL: url }));
    await prisma.onModuleInit();

    // Only `ayah` and `sura` may be read; anything else (tafsir, ...) throws.
    const guarded = new Proxy(prisma, {
      get(target, prop, receiver) {
        if (typeof prop === 'string' && !prop.startsWith('$') && !prop.startsWith('_')) {
          touched.add(prop);
          if (prop !== 'ayah' && prop !== 'sura') {
            throw new Error(`search loader touched prisma.${prop}`);
          }
        }
        return Reflect.get(target, prop, receiver) as unknown;
      },
    });
    const loader = new CorpusLoader(guarded);
    const corpus = await loader.load();
    suras = await loader.loadSuras();
    const snapshot = buildSnapshot(corpus, suras);
    service = new SearchService({
      currentSnapshot: () => snapshot,
    } as unknown as SearchIndexService);
    docs = corpus.map((d) => ({
      ref: `${d.suraNumber}:${d.ayahNumber}`,
      textSimple: d.textSimple,
    }));
  });

  afterAll(async () => {
    await prisma?.onModuleDestroy();
  });

  it('reads only the ayahs and suras tables', () => {
    expect([...touched].sort()).toEqual(['ayah', 'sura']);
  });

  it('the live suras table equals the unit-test fixture (114 suras, 6236 ayahs)', () => {
    expect(suras).toEqual(SURAS_FIXTURE);
    expect(suras.reduce((n, s) => n + s.ayahCount, 0)).toBe(6236);
  });

  it('every sura resolves in all four basic forms', () => {
    const wrong: string[] = [];
    for (const s of suras) {
      const cases: [string, string][] = [
        [s.nameAr, `${s.number}:1`],
        [`سورة ${s.nameAr}`, `${s.number}:1`],
        [`${s.nameAr} ${s.ayahCount}`, `${s.number}:${s.ayahCount}`],
        [`${s.number}:${s.ayahCount}`, `${s.number}:${s.ayahCount}`],
      ];
      for (const [q, want] of cases) {
        const top = service.search(q).results[0];
        if (top?.ref !== want || top.matchType !== 'reference') wrong.push(q);
      }
      if (service.search(`${s.number}:${s.ayahCount + 1}`).reference?.status !== 'invalid') {
        wrong.push(`${s.number}:${s.ayahCount + 1}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('a bare name that is also Quran text keeps every phrase match after the reference', async () => {
    const out = service.search('الرحمن', { limit: 1000 });
    expect(out.reference).toMatchObject({ ref: { kind: 'sura', sura: 55 }, ambiguous: true });
    expect(out.results[0]).toMatchObject({ ref: '55:1', matchType: 'reference' });
    const phrase = (await createPhraseBaseline(docs)('الرحمن', 'text')).map((h) => h.ref);
    expect(new Set(out.results.map((r) => r.ref))).toEqual(new Set(phrase));
    expect(out.total).toBe(phrase.length);
  });
});
