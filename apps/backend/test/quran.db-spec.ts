/**
 * Read-only HTTP checks against the REAL database (opt-in: `npm run test:db`).
 * Proves utf8mb4 end to end: MySQL -> Prisma -> JSON response, compared byte-for-byte with the
 * same row read through a separate utf8mb4 connection.
 */
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/bootstrap/setup-app';
import { PrismaService } from '../src/prisma/prisma.service';

const AL_FATIHA = String.fromCodePoint(0x0627, 0x0644, 0x0641, 0x0627, 0x062a, 0x062d, 0x0629);

interface AyahBody {
  id: number;
  textUthmani: string;
  textSimple: string;
}

describe('Quran endpoints against the real database (read-only)', () => {
  let app: NestExpressApplication;
  let server: App;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
      logger: false,
    });
    setupApp(app);
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /suras returns 114 suras, sura 1 name is exact', async () => {
    const res = await request(server).get('/suras').expect(200);
    const data = (res.body as { data: { number: number; nameAr: string }[] }).data;
    expect(data).toHaveLength(114);
    expect(data[0]).toMatchObject({ number: 1, nameAr: AL_FATIHA });
  });

  it('GET /suras/2 ayah text is byte-identical to the DB (utf8mb4 end to end)', async () => {
    const res = await request(server).get('/suras/2?limit=100&page=3').expect(200);
    const body = res.body as { ayahs: AyahBody[]; pagination: { total: number } };
    expect(body.pagination.total).toBe(286);
    expect(body.ayahs).toHaveLength(86);

    const ids = body.ayahs.map((a) => a.id);
    const rows = await prisma.$queryRaw<{ id: number | bigint; u: Buffer; s: Buffer }[]>`
      SELECT id, CAST(text_uthmani AS BINARY) AS u, CAST(text_simple AS BINARY) AS s
      FROM ayahs WHERE sura_number = 2 AND ayah_number > 200 ORDER BY ayah_number`;
    expect(rows.map((r) => Number(r.id))).toEqual(ids);
    rows.forEach((row, i) => {
      expect(Buffer.from(body.ayahs[i].textUthmani, 'utf8').equals(Buffer.from(row.u))).toBe(true);
      expect(Buffer.from(body.ayahs[i].textSimple, 'utf8').equals(Buffer.from(row.s))).toBe(true);
    });
  });

  it('GET /topics never contains a banned topic, in flat or tree form', async () => {
    const banned = await prisma.category.findMany({
      where: { isBanned: true },
      select: { id: true },
    });
    expect(banned.length).toBeGreaterThan(0);
    const bannedIds = new Set(banned.map((b) => b.id));

    const flat = await request(server).get('/topics').expect(200);
    const flatIds = (flat.body as { data: { id: number }[] }).data.map((t) => t.id);
    expect(flatIds.some((id) => bannedIds.has(id))).toBe(false);

    const tree = await request(server).get('/topics?tree=true').expect(200);
    const treeIds: number[] = [];
    const walk = (nodes: { id: number; children: unknown[] }[]) =>
      nodes.forEach((n) => {
        treeIds.push(n.id);
        walk(n.children as { id: number; children: unknown[] }[]);
      });
    walk((tree.body as { data: { id: number; children: unknown[] }[] }).data);
    expect(treeIds.sort((a, b) => a - b)).toEqual([...flatIds].sort((a, b) => a - b));

    for (const id of bannedIds) await request(server).get(`/topics/${id}`).expect(404);
    expect(JSON.stringify(flat.body)).not.toMatch(/legacyUuid|titleRaw/);
  });

  it('GET /tafsir-books hides placeholders; GET /tafsirs returns book 1 content', async () => {
    const books = await request(server).get('/tafsir-books').expect(200);
    const ids = (books.body as { data: { id: number }[] }).data.map((b) => b.id);
    expect(ids).not.toEqual(expect.arrayContaining([0]));
    for (const hidden of [0, 2, 3, 4]) expect(ids).not.toContain(hidden);

    const t = await request(server).get('/tafsirs?ayah_id=1&book_ids=1,2,4').expect(200);
    const data = (t.body as { data: { bookId: number; content: string }[] }).data;
    expect(data.map((d) => d.bookId)).toEqual([1]);
    expect(data[0].content.length).toBeGreaterThan(0);
  });
});
