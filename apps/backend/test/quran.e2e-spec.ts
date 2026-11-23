import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { App } from 'supertest/types';
import { createTestApp } from './support/test-app';

// Arabic built from code points so editors/terminals cannot alter it.
const AL_FATIHA = String.fromCodePoint(0x0627, 0x0644, 0x0641, 0x0627, 0x062a, 0x062d, 0x0629);
// prettier-ignore
const BISMILLAH_UTHMANI = String.fromCodePoint(
  0x0628, 0x0650, 0x0633, 0x0652, 0x0645, 0x0650, 0x0020,
  0x0671, 0x0644, 0x0644, 0x0651, 0x064e, 0x0647, 0x0650,
);

const sura = {
  number: 1,
  nameAr: AL_FATIHA,
  nameEn: 'Al-Faatiha',
  ayahCount: 7,
  revelationPlace: 'mecca',
};
const ayah = {
  id: 1,
  suraNumber: 1,
  ayahNumber: 1,
  textUthmani: BISMILLAH_UTHMANI,
  textSimple: 's',
  juz: 1,
  page: 1,
};
const topics = [
  { id: 1, parentId: null, title: AL_FATIHA, description: null },
  { id: 2, parentId: 1, title: 'child', description: null },
];

function prismaStub() {
  return {
    sura: {
      findMany: jest.fn().mockResolvedValue([sura]),
      findUnique: jest.fn(({ where }: { where: { number: number } }) =>
        Promise.resolve(where.number === 1 ? sura : null),
      ),
    },
    ayah: {
      findMany: jest.fn().mockResolvedValue([ayah]),
      count: jest.fn().mockResolvedValue(1),
      findUnique: jest.fn(({ where }: { where: { id: number } }) =>
        Promise.resolve(where.id === 1 ? { id: 1, suraNumber: 1, ayahNumber: 1 } : null),
      ),
    },
    category: { findMany: jest.fn().mockResolvedValue(topics) },
    tafsirBook: { findMany: jest.fn().mockResolvedValue([{ id: 1, name: 'n', author: 'a' }]) },
    tafsir: {
      // The passage lookup (same text in the sura) asks for `ayah`: only this ayah stores it.
      findMany: jest.fn((args: { select?: { ayah?: unknown } }) =>
        Promise.resolve(
          args?.select?.ayah
            ? [{ content: BISMILLAH_UTHMANI, ayah: { ayahNumber: 1, textSimple: 'بسم الله' } }]
            : [{ bookId: 1, content: BISMILLAH_UTHMANI, book: { name: 'n', author: 'a' } }],
        ),
      ),
    },
  };
}

describe('Quran read endpoints (e2e, Prisma stubbed)', () => {
  let app: NestExpressApplication;
  let server: App;
  let prisma: ReturnType<typeof prismaStub>;

  beforeEach(async () => {
    prisma = prismaStub();
    app = await createTestApp([], prisma);
    server = app.getHttpServer();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /suras', () => {
    it('200 with the list', async () => {
      const res = await request(server).get('/suras').expect(200);
      expect(res.body).toEqual({ data: [sura] });
    });
  });

  describe('GET /suras/:number', () => {
    it('200 with sura, ayahs and pagination; Arabic round-trips byte-for-byte', async () => {
      const res = await request(server).get('/suras/1?page=1&limit=10').expect(200);
      expect(res.body).toEqual({
        sura,
        ayahs: [ayah],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
      });
      const body = res.body as { sura: { nameAr: string }; ayahs: { textUthmani: string }[] };
      expect(body.sura.nameAr).toBe(AL_FATIHA);
      expect(Buffer.from(body.ayahs[0].textUthmani, 'utf8')).toEqual(
        Buffer.from(BISMILLAH_UTHMANI, 'utf8'),
      );
      expect(String(res.headers['content-type'])).toContain('charset=utf-8');
    });

    it('404 for a valid number with no row', async () => {
      const res = await request(server).get('/suras/2').expect(404);
      expect(res.body).toMatchObject({ statusCode: 404, message: 'Sura 2 not found' });
    });

    it.each([
      '/suras/0',
      '/suras/115',
      '/suras/abc',
      '/suras/1.5',
      '/suras/-1',
      '/suras/1?limit=101',
      '/suras/1?limit=0',
      '/suras/1?page=0',
      '/suras/1?page=x',
      '/suras/1?page=1&page=2',
      '/suras/1?unknown=1',
    ])('400 for %s', async (url) => {
      const res = await request(server).get(url).expect(400);
      expect(res.body).toMatchObject({ statusCode: 400, message: 'Validation failed' });
    });
  });

  describe('GET /topics', () => {
    it('200 flat list with parentId, no internal fields', async () => {
      const res = await request(server).get('/topics').expect(200);
      expect(res.body).toEqual({ data: topics });
      expect(JSON.stringify(res.body)).not.toMatch(
        /legacyUuid|titleRaw|isBanned|legacy_uuid|title_raw/,
      );
      expect(prisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isBanned: false } }),
      );
    });

    it('200 tree with ?tree=true', async () => {
      const res = await request(server).get('/topics?tree=true').expect(200);
      expect(res.body).toEqual({
        data: [{ ...topics[0], children: [{ ...topics[1], children: [] }] }],
      });
    });

    it.each(['/topics?tree=1', '/topics?tree=yes', '/topics?x=1'])('400 for %s', async (url) => {
      await request(server).get(url).expect(400);
    });
  });

  describe('GET /topics/:id', () => {
    it('200 with topic, ayahs and pagination', async () => {
      const res = await request(server).get('/topics/2').expect(200);
      expect(res.body).toMatchObject({ topic: topics[1], ayahs: [ayah] });
    });

    it('404 for a missing or banned topic (same response)', async () => {
      const res = await request(server).get('/topics/50').expect(404);
      expect(res.body).toMatchObject({ statusCode: 404, message: 'Topic 50 not found' });
    });

    it.each(['/topics/0', '/topics/abc', '/topics/2?limit=500'])('400 for %s', async (url) => {
      await request(server).get(url).expect(400);
    });
  });

  describe('GET /tafsir-books', () => {
    it('200 and the query excludes placeholder ids', async () => {
      const res = await request(server).get('/tafsir-books').expect(200);
      expect(res.body).toEqual({ data: [{ id: 1, name: 'n', author: 'a' }] });
      expect(prisma.tafsirBook.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { notIn: [0, 2, 3, 4] } } }),
      );
    });
  });

  describe('GET /tafsirs', () => {
    it('200 with content for the ayah', async () => {
      const res = await request(server).get('/tafsirs?ayah_id=1&book_ids=1').expect(200);
      expect(res.body).toEqual({
        ayahId: 1,
        data: [
          { bookId: 1, bookName: 'n', author: 'a', content: BISMILLAH_UTHMANI, passage: null },
        ],
      });
    });

    it('404 for an unknown ayah', async () => {
      await request(server).get('/tafsirs?ayah_id=99999').expect(404);
    });

    it.each([
      '/tafsirs',
      '/tafsirs?ayah_id=',
      '/tafsirs?ayah_id=abc',
      '/tafsirs?ayah_id=0',
      '/tafsirs?ayah_id=1&book_ids=',
      '/tafsirs?ayah_id=1&book_ids=1,x',
      '/tafsirs?ayah_id=1&book_ids=999',
      '/tafsirs?ayah_id=1&ayah_id=2',
    ])('400 for %s', async (url) => {
      await request(server).get(url).expect(400);
    });
  });

  it('never returns 500 for hostile-looking input', async () => {
    const urls = [
      "/suras/1'%20OR%201=1--",
      '/suras/%00',
      '/topics/1;DROP%20TABLE%20categories',
      '/tafsirs?ayah_id[]=1',
      '/tafsirs?ayah_id=1%27',
      `/suras/${'9'.repeat(400)}`,
    ];
    for (const url of urls) {
      const res = await request(server).get(url);
      expect([400, 404]).toContain(res.status);
    }
  });
});
