import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { App } from 'supertest/types';
import { SearchIndexService } from '../src/search/index/search-index.service';
import type { SearchResponse } from '../src/search/search.controller';
import { createTestApp } from './support/test-app';

const AYAHS = [
  {
    id: 1,
    suraNumber: 112,
    ayahNumber: 1,
    textSimple: 'قل هو الله أحد',
    textUthmani: 'قُلْ هُوَ ٱللَّهُ أَحَدٌ',
  },
  { id: 2, suraNumber: 112, ayahNumber: 2, textSimple: 'الله الصمد', textUthmani: 'ٱللَّهُ ٱلصَّمَدُ' },
  {
    id: 3,
    suraNumber: 112,
    ayahNumber: 3,
    textSimple: 'لم يلد ولم يولد',
    textUthmani: 'لَمْ يَلِدْ وَلَمْ يُولَدْ',
  },
  {
    id: 4,
    suraNumber: 112,
    ayahNumber: 4,
    textSimple: 'ولم يكن له كفوا أحد',
    textUthmani: 'وَلَمْ يَكُن لَّهُۥ كُفُوًا أَحَدٌۢ',
  },
];

/** Waits until the startup build has settled (ready or failed). */
async function settled(app: NestExpressApplication): Promise<void> {
  const svc = app.get(SearchIndexService);
  for (let i = 0; i < 200; i++) {
    const { state } = svc.status();
    if (state === 'ready' || state === 'failed') return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error('search index build did not settle');
}

describe('GET /search (e2e)', () => {
  let app: NestExpressApplication;
  let server: App;
  const tafsir = jest.fn();

  beforeAll(async () => {
    app = await createTestApp([], {
      ayah: { findMany: jest.fn().mockResolvedValue(AYAHS) },
      sura: {
        findMany: jest.fn().mockResolvedValue([{ number: 112, nameAr: 'الإخلاص', ayahCount: 4 }]),
      },
      tafsir: { findMany: tafsir, findFirst: tafsir, findUnique: tafsir },
    });
    await settled(app);
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  const search = (query: Record<string, string | string[]>) =>
    request(server).get('/search').query(query);
  const body = async (query: Record<string, string>) =>
    (await search(query).expect(200)).body as SearchResponse;

  it('returns the claude.md 5.7 shape, with Uthmani highlights and no internal fields', async () => {
    const res = await search({ q: 'الله الصمد' }).expect(200);
    expect(res.body).toEqual({
      query: { raw: 'الله الصمد', normalized: 'الله الصمد' },
      corrected: null,
      didYouMean: null,
      reference: null,
      total: 1,
      page: 1,
      limit: 50,
      totalPages: 1,
      results: [
        {
          ayahId: 2,
          suraNumber: 112,
          suraName: 'الإخلاص',
          ayahNumber: 2,
          ref: '112:2',
          textUthmani: 'ٱللَّهُ ٱلصَّمَدُ',
          matchType: 'phrase',
          score: expect.any(Number) as number,
          confidence: 'high',
          highlights: [{ start: 0, end: 'ٱللَّهُ ٱلصَّمَدُ'.length }],
        },
      ],
    });
    expect(tafsir).not.toHaveBeenCalled();
  });

  it('references, ordered and all-terms matches', async () => {
    const ref = await body({ q: 'الإخلاص ٤' });
    expect(ref.reference).toMatchObject({ status: 'ok', ref: { sura: 112, ayah: 4 } });
    expect(ref.results.map((r) => r.ref)).toEqual(['112:4']);

    const invalid = await body({ q: '112:5' });
    expect(invalid.reference).toMatchObject({ status: 'invalid', ayahCount: 4 });
    expect(invalid.results).toEqual([]);

    const ordered = await body({ q: 'لم يولد' }); // in order, one word between
    expect(ordered.results.map((r) => r.matchType)).toEqual(['ordered']);
    const anyOrder = await body({ q: 'أحد الله' });
    expect(anyOrder.results.map((r) => r.matchType)).toEqual(['all_terms']);
  });

  it('Phase 3: corrects an OOV word (5.7 `corrected`), suggests for vocabulary-only misses', async () => {
    const typo = await body({ q: 'الله الصمدد' });
    expect(typo.corrected).toEqual({
      applied: true,
      text: 'الله الصمد',
      changes: [{ from: 'الصمدد', to: 'الصمد', kind: 'edit1' }],
    });
    expect(typo.results.map((r) => [r.ref, r.matchType, r.confidence])).toEqual([
      ['112:2', 'corrected', 'medium'],
    ]);
    const none = await body({ q: 'الصمد يولد' }); // both words exist, never together
    expect(none).toMatchObject({ corrected: null, total: 0 });
  });

  it('paginates', async () => {
    const res = await body({ q: 'أحد', page: '2', limit: '1' });
    expect(res).toMatchObject({ total: 2, page: 2, limit: 1, totalPages: 2 });
    expect(res.results).toHaveLength(1);
  });

  it('non-Arabic text is valid input with no results', async () => {
    const res = await search({ q: 'hello' }).expect(200);
    expect(res.body).toMatchObject({ total: 0, results: [], query: { normalized: '' } });
  });

  it.each<[string, Record<string, string | string[]>]>([
    ['missing q', {}],
    ['blank q', { q: '   ' }],
    ['q longer than 200 chars', { q: 'ا'.repeat(201) }],
    ['more than 20 words', { q: Array(21).fill('الله').join(' ') }],
    ['repeated q', { q: ['الله', 'الصمد'] }],
    ['alts without type=voice', { q: 'الله', alts: 'الله الصمد' }],
    ['type=audio', { q: 'الله', type: 'audio' }],
    ['more than 5 alts', { q: 'الله', type: 'voice', alts: 'ا|ب|ت|ث|ج|ح' }],
    ['a blank alt', { q: 'الله', type: 'voice', alts: 'الله| ' }],
    ['an alt longer than 200 chars', { q: 'الله', type: 'voice', alts: 'ا'.repeat(201) }],
    ['unknown parameter', { q: 'الله', foo: '1' }],
    ['limit above 100', { q: 'الله', limit: '101' }],
    ['page 0', { q: 'الله', page: '0' }],
    ['non-integer page', { q: 'الله', page: '1.5' }],
  ])('400 for %s', async (_name, query) => {
    const res = await search(query).expect(400);
    expect(res.body).toMatchObject({ statusCode: 400, path: '/search' });
  });

  it('accepts exactly 200 chars and 20 words, and type=text', async () => {
    await search({ q: 'ا'.repeat(200) }).expect(200);
    await search({ q: Array(20).fill('الله').join(' '), type: 'text' }).expect(200);
  });
});

describe('GET /search before the index is ready (e2e)', () => {
  it('503 with the standard error body while the index is unavailable', async () => {
    const app = await createTestApp(); // Prisma stub has no ayahs: the build fails
    try {
      await settled(app);
      const res = await request(app.getHttpServer())
        .get('/search')
        .query({ q: 'الله' })
        .expect(503);
      expect(res.body).toMatchObject({ statusCode: 503, path: '/search' });
      // Input is still validated first.
      await request(app.getHttpServer()).get('/search').expect(400);
    } finally {
      await app.close();
    }
  });
});

describe('GET /search rate limit (e2e)', () => {
  it('uses the `search` throttler: the 31st request in a minute is 429', async () => {
    const app = await createTestApp();
    try {
      const server = app.getHttpServer();
      for (let i = 1; i <= 30; i++) {
        const res = await request(server).get('/search').query({ q: 'الله' });
        if (res.status !== 503) throw new Error(`request ${i} returned ${res.status}`);
      }
      const blocked = await request(server).get('/search').query({ q: 'الله' }).expect(429);
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    } finally {
      await app.close();
    }
  }, 30_000);
});
