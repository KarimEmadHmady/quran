import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { SearchIndexService } from '../src/search/index/search-index.service';
import type { SearchResponse } from '../src/search/search.controller';
import { createTestApp } from './support/test-app';

const COOKIE = 'qa_admin_session';
const SURA = { number: 112, nameAr: 'الإخلاص', ayahCount: 2 };
const row = (id: number, ayahNumber: number, text: string) => ({
  id,
  suraNumber: 112,
  ayahNumber,
  textSimple: text,
  textUthmani: text,
});
const CORPUS_A = [row(1, 1, 'قل هو الله أحد'), row(2, 2, 'الله الصمد')];
const CORPUS_B = [row(1, 1, 'قل هو الله أحد'), row(2, 2, 'الله الصمد الكبير')];

async function settled(app: NestExpressApplication): Promise<void> {
  const svc = app.get(SearchIndexService);
  for (let i = 0; i < 200; i++) {
    const { state } = svc.status();
    if (state === 'ready' || state === 'failed') return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error('search index build did not settle');
}

describe('POST /admin/search/reindex (e2e)', () => {
  let app: NestExpressApplication;
  let ayahFindMany: jest.Mock;
  let tafsir: jest.Mock;
  let cookie: string;

  beforeEach(async () => {
    ayahFindMany = jest.fn().mockResolvedValue(CORPUS_A);
    tafsir = jest.fn();
    app = await createTestApp([], {
      ayah: { findMany: ayahFindMany },
      sura: { findMany: jest.fn().mockResolvedValue([SURA]) },
      tafsir: { findMany: tafsir, findFirst: tafsir, findUnique: tafsir },
    });
    await settled(app);
    // A valid admin session, signed exactly like AuthService does.
    const token = await app.get(JwtService).signAsync({ sub: '7' });
    cookie = `${COOKIE}=${token}`;
  });

  afterEach(async () => {
    await app.close();
  });

  const reindex = (withCookie?: string) => {
    const req = request(app.getHttpServer()).post('/admin/search/reindex');
    return withCookie ? req.set('Cookie', withCookie) : req;
  };
  const search = async (q: string) =>
    (await request(app.getHttpServer()).get('/search').query({ q }).expect(200))
      .body as SearchResponse;

  it('requires an admin session (401 without one, or with a tampered token)', async () => {
    const res = await reindex().expect(401);
    expect(res.body).toMatchObject({ statusCode: 401, path: '/admin/search/reindex' });
    await reindex(`${cookie}x`).expect(401);
    expect(ayahFindMany).toHaveBeenCalledTimes(1); // startup build only
  });

  it('rebuilds from the DB (read-only), returns the status, and serves the new data', async () => {
    expect((await search('الصمد الكبير')).total).toBe(0);

    ayahFindMany.mockResolvedValue(CORPUS_B);
    const res = await reindex(cookie).expect(200);
    expect(res.body).toMatchObject({
      state: 'ready',
      ready: true,
      stats: { docs: 2 },
      builtAt: expect.any(String) as string,
    });
    expect(ayahFindMany).toHaveBeenCalledTimes(2);
    expect(tafsir).not.toHaveBeenCalled();

    // The cached empty answer from before must not be served.
    const after = await search('الصمد الكبير');
    expect(after.results.map((r) => r.ref)).toEqual(['112:2']);
  });

  it('a failed rebuild returns 503 without details and keeps serving the previous index', async () => {
    ayahFindMany.mockRejectedValue(new Error('connect ECONNREFUSED secret-host:3306'));
    const res = await reindex(cookie).expect(503);
    expect(res.body).toMatchObject({
      statusCode: 503,
      message: 'Reindex failed; the previous search index (if any) is still being served',
    });
    expect(JSON.stringify(res.body)).not.toContain('secret-host');
    expect((await search('الله الصمد')).total).toBe(1);
  });

  it('only POST is routed', async () => {
    await request(app.getHttpServer())
      .get('/admin/search/reindex')
      .set('Cookie', cookie)
      .expect(404);
  });
});

describe('GET /search/suggest (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp([], {
      ayah: { findMany: jest.fn().mockResolvedValue(CORPUS_A) },
      sura: { findMany: jest.fn().mockResolvedValue([SURA]) },
    });
    await settled(app);
  });

  afterAll(async () => {
    await app.close();
  });

  const suggest = (query: Record<string, string | string[]>) =>
    request(app.getHttpServer()).get('/search/suggest').query(query);

  it('returns up to 5 completions of the last word', async () => {
    const res = await suggest({ q: 'قل هو ال' }).expect(200);
    expect(res.body).toEqual({
      query: { raw: 'قل هو ال', normalized: 'قل هو ال' },
      suggestions: [
        { text: 'قل هو الله', word: 'الله', kind: 'prefix' },
        { text: 'قل هو الصمد', word: 'الصمد', kind: 'prefix' },
      ],
    });
  });

  it.each<[string, Record<string, string | string[]>]>([
    ['missing q', {}],
    ['blank q', { q: ' ' }],
    ['q longer than 200 chars', { q: 'ا'.repeat(201) }],
    ['more than 20 words', { q: Array(21).fill('الله').join(' ') }],
    ['repeated q', { q: ['ال', 'الله'] }],
    ['unknown parameter (e.g. page)', { q: 'ال', page: '1' }],
  ])('400 for %s', async (_name, query) => {
    await suggest(query).expect(400);
  });

  it('is not on the `search` throttler (40 calls in a row are fine)', async () => {
    for (let i = 0; i < 40; i++) {
      const res = await suggest({ q: 'ال' });
      if (res.status !== 200) throw new Error(`call ${i + 1} returned ${res.status}`);
    }
  }, 30_000);

  it('503 before the index is ready', async () => {
    const empty = await createTestApp();
    try {
      await settled(empty);
      await request(empty.getHttpServer()).get('/search/suggest').query({ q: 'ال' }).expect(503);
    } finally {
      await empty.close();
    }
  });
});
