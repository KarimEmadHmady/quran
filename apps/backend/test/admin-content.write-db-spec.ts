/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment --
   supertest bodies are untyped JSON; every assertion below checks their exact shape. */
/**
 * Phase 6 admin CRUD against a REAL MySQL database — but only the isolated "<db>_test" copy
 * (`npm run db:test:create`; the setup file refuses any other target). Every change made here
 * is reverted in the test itself, and ayah / tafsir text is checked to be byte-identical after.
 *
 *   npm run test:write-db -w @quran/backend
 *   (optional) E2E_ADMIN_PASSWORD=... also exercises the real login of the seeded admin.
 */
import { createHash } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/bootstrap/setup-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { SearchIndexService } from '../src/search/index/search-index.service';

const COOKIE = 'qa_admin_session';
const ADMIN_EMAIL = 'admin@quran.com';

describe('Admin content API against the isolated test database', () => {
  let app: NestExpressApplication;
  let server: App;
  let prisma: PrismaService;
  let cookie: string;
  let fingerprint: string;
  const createdTopicIds: number[] = [];

  /** Hash of every ayah text + every tafsir text: must not change in any admin flow. */
  async function contentFingerprint(): Promise<string> {
    const hash = createHash('sha256');
    const ayahs = await prisma.ayah.findMany({
      select: { id: true, textUthmani: true, textSimple: true },
      orderBy: { id: 'asc' },
    });
    for (const a of ayahs) hash.update(`${a.id}|${a.textUthmani}|${a.textSimple}\n`);
    const tafsirs = await prisma.$queryRaw<{ id: number; h: string }[]>`
      SELECT id, MD5(IFNULL(content, '')) AS h FROM tafsirs ORDER BY id`;
    for (const t of tafsirs) hash.update(`t${t.id}|${t.h}\n`);
    return hash.digest('hex');
  }

  beforeAll(async () => {
    expect(process.env.WRITE_DB_TARGET).toMatch(/_test$/);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
      logger: false,
    });
    setupApp(app);
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);

    // Session for the seeded admin (signed like AuthService does).
    const admin = await prisma.admin.findUnique({ where: { email: ADMIN_EMAIL } });
    if (!admin)
      throw new Error(`seed ${ADMIN_EMAIL} into the test database first (npm run seed:admin)`);
    cookie = `${COOKIE}=${await app.get(JwtService).signAsync({ sub: String(admin.id) })}`;

    const svc = app.get(SearchIndexService);
    for (let i = 0; i < 600 && svc.status().state !== 'ready'; i++) {
      await new Promise((r) => setTimeout(r, 50));
    }
    fingerprint = await contentFingerprint();
  }, 120_000);

  afterAll(async () => {
    if (createdTopicIds.length) {
      await prisma.category.deleteMany({ where: { id: { in: createdTopicIds } } });
    }
    await app?.close();
  });

  const as = (method: 'get' | 'post' | 'patch' | 'delete', path: string, body?: object) => {
    const req = request(server)[method](path).set('Cookie', cookie);
    return body ? req.send(body) : req;
  };

  it('targets the _test database and it has the expected content', async () => {
    const [db] = await prisma.$queryRaw<{ db: string }[]>`SELECT DATABASE() AS db`;
    expect(db.db).toBe(process.env.WRITE_DB_TARGET);
    expect(await prisma.ayah.count()).toBe(6236);
  });

  const password = process.env.E2E_ADMIN_PASSWORD;
  (password ? it : it.skip)(
    'real login of the seeded admin works; a wrong password is a 401',
    async () => {
      const ok = await request(server)
        .post('/admin/auth/login')
        .send({ email: ADMIN_EMAIL, password })
        .expect(200);
      expect(ok.body.admin).toMatchObject({ email: ADMIN_EMAIL, name: 'Admin' });
      expect(JSON.stringify(ok.body)).not.toMatch(/passwordHash|\$2[aby]\$/);
      await request(server)
        .post('/admin/auth/login')
        .send({ email: ADMIN_EMAIL, password: `${password}x` })
        .expect(401);
    },
  );

  it('stats reflect the real data', async () => {
    const res = await as('get', '/admin/stats').expect(200);
    expect(res.body).toMatchObject({
      suras: 114,
      ayahs: 6236,
      tafsirBooks: { total: 5, visible: 1 },
    });
    expect(res.body.topics.banned).toBeGreaterThanOrEqual(3);
  });

  it('topic lifecycle: create -> link -> public -> ban -> unban -> unlink -> delete (cascade)', async () => {
    const title = `اختبار لوحة التحكم ${Date.now()}`;
    const created = await as('post', '/admin/topics', { title, description: 'وصف' }).expect(201);
    const id: number = created.body.id;
    createdTopicIds.push(id);
    expect(created.body).toMatchObject({ title, isBanned: false, hidden: false, ayahCount: 0 });

    await as('post', '/admin/topics', { title }).expect(409);

    const child = await as('post', '/admin/topics', { title: 'فرعي', parentId: id }).expect(201);
    const childId = child.body.id as number;
    createdTopicIds.push(childId);
    await as('patch', `/admin/topics/${id}`, { parentId: childId }).expect(400); // cycle

    const linked = await as('post', `/admin/topics/${id}/ayahs`, { ayahIds: [262, 1, 262] }).expect(
      200,
    );
    expect(linked.body).toEqual({ added: [262, 1], skipped: [] });
    expect(
      (await as('post', `/admin/topics/${id}/ayahs`, { ayahIds: [1] }).expect(200)).body,
    ).toEqual({
      added: [],
      skipped: [1],
    });
    await as('post', `/admin/topics/${id}/ayahs`, { ayahIds: [6237] }).expect(404);

    const pub = await request(server).get(`/topics/${id}`).expect(200);
    expect(pub.body.ayahs.map((a: { id: number }) => a.id)).toEqual([1, 262]);

    await as('patch', `/admin/topics/${id}`, { isBanned: true }).expect(200);
    await request(server).get(`/topics/${id}`).expect(404);
    await request(server).get(`/topics/${childId}`).expect(404); // subtree hidden too
    await as('patch', `/admin/topics/${id}`, { isBanned: false }).expect(200);
    await request(server).get(`/topics/${id}`).expect(200);

    await as('delete', `/admin/topics/${id}/ayahs/262`).expect(204);
    await as('delete', `/admin/topics/${id}/ayahs/262`).expect(404);

    await as('delete', `/admin/topics/${id}`).expect(409); // has a child
    await as('delete', `/admin/topics/${childId}`).expect(204);
    await as('delete', `/admin/topics/${id}`).expect(204);
    expect(await prisma.categoryAyah.count({ where: { categoryId: id } })).toBe(0);
    expect(await prisma.ayah.count({ where: { id: { in: [1, 262] } } })).toBe(2);
    createdTopicIds.length = 0;
  });

  it('sura rename reindexes reference search, and is restored', async () => {
    const before = await prisma.sura.findUniqueOrThrow({ where: { number: 112 } });
    try {
      const res = await as('patch', '/admin/suras/112', {
        nameAr: 'الاختبارية',
      }).expect(200);
      expect(res.body.reindex).toBe('done');
      const s = await request(server).get('/search').query({ q: 'الاختبارية 2' }).expect(200);
      expect(s.body.results[0]).toMatchObject({
        suraNumber: 112,
        ayahNumber: 2,
        matchType: 'reference',
      });
      await as('patch', '/admin/suras/112', { nameAr: 'البقرة' }).expect(409);
    } finally {
      await as('patch', '/admin/suras/112', {
        nameAr: before.nameAr,
        nameEn: before.nameEn,
      }).expect(200);
    }
    const after = await prisma.sura.findUniqueOrThrow({ where: { number: 112 } });
    expect(after).toEqual(before);
  });

  it('tafsir book author edit (hidden book stays hidden publicly), and is restored', async () => {
    const before = await prisma.tafsirBook.findUniqueOrThrow({ where: { id: 2 } });
    try {
      const res = await as('patch', '/admin/tafsir-books/2', { author: 'مؤلف تجريبي' }).expect(200);
      expect(res.body).toMatchObject({ id: 2, author: 'مؤلف تجريبي', hidden: true });
      const pub = await request(server).get('/tafsir-books').expect(200);
      expect(pub.body.data.map((b: { id: number }) => b.id)).toEqual([1]);
      const admin = await as('get', '/admin/tafsirs?ayah_id=262').expect(200);
      expect(
        admin.body.data.some(
          (t: { bookId: number; hidden: boolean }) => t.bookId === 2 && t.hidden,
        ),
      ).toBe(true);
    } finally {
      await prisma.tafsirBook.update({
        where: { id: 2 },
        data: { author: before.author, name: before.name },
      });
    }
  });

  it('ayah and tafsir text are byte-identical after all admin flows', async () => {
    expect(await contentFingerprint()).toBe(fingerprint);
  }, 60_000);
});
