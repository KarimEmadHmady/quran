import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { SearchIndexService } from '../src/search/index/search-index.service';
import { SearchService } from '../src/search/search.service';
import { createTestApp } from './support/test-app';

/** Waits until the startup build has settled (ready or failed), without starting a new one. */
async function settled(svc: SearchIndexService): Promise<void> {
  for (let i = 0; i < 200; i++) {
    const { state } = svc.status();
    if (state === 'ready' || state === 'failed') return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error('search index build did not settle');
}

describe('GET /health (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp(); // Prisma stub has no ayahs: the index build fails
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 200 with status ok', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok' });
  });

  it('reports searchReady=false when the index could not be built (API still healthy)', async () => {
    const svc = app.get(SearchIndexService);
    await settled(svc);
    expect(svc.status().state).toBe('failed');
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', searchReady: false });
  });

  it('returns 404 for unknown routes', async () => {
    await request(app.getHttpServer()).get('/does-not-exist').expect(404);
  });
});

describe('search index startup (e2e)', () => {
  it('builds from the ayahs + suras tables only at startup and flips searchReady to true', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 1,
        suraNumber: 112,
        ayahNumber: 1,
        textSimple: 'قل هو الله أحد',
        textUthmani: 'قُلْ هُوَ ٱللَّهُ أَحَدٌ',
      },
      {
        id: 2,
        suraNumber: 112,
        ayahNumber: 2,
        textSimple: 'الله الصمد',
        textUthmani: 'ٱللَّهُ ٱلصَّمَدُ',
      },
    ]);
    const suraFindMany = jest
      .fn()
      .mockResolvedValue([{ number: 112, nameAr: 'الإخلاص', ayahCount: 2 }]);
    const tafsirFindMany = jest.fn();
    const app = await createTestApp([], {
      ayah: { findMany },
      sura: { findMany: suraFindMany },
      tafsir: { findMany: tafsirFindMany, findFirst: tafsirFindMany, findUnique: tafsirFindMany },
    });
    try {
      const svc = app.get(SearchIndexService);
      await settled(svc);
      const index = svc.current();
      if (!index) throw new Error('index not built');
      expect(findMany).toHaveBeenCalledTimes(1); // built once, at startup
      expect(suraFindMany).toHaveBeenCalledTimes(1);
      expect(tafsirFindMany).not.toHaveBeenCalled(); // never touches tafsirs
      expect(index.findPhraseText('الله الصمد').map((m) => index.doc(m.docIndex).ref)).toEqual([
        '112:2',
      ]);
      const res = await request(app.getHttpServer()).get('/health').expect(200);
      expect(res.body).toMatchObject({ status: 'ok', searchReady: true });

      // S4: the wired SearchService answers references and phrases from the same snapshot.
      const search = app.get(SearchService);
      expect(search.search('الإخلاص ٢').results.map((r) => [r.ref, r.matchType])).toEqual([
        ['112:2', 'reference'],
      ]);
      // S5 ranking: the shorter ayah ranks first among phrase matches.
      expect(search.search('الله').results.map((r) => r.ref)).toEqual(['112:2', '112:1']);
    } finally {
      await app.close();
    }
  });
});
