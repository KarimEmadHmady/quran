/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment --
   supertest bodies are untyped JSON; every assertion below checks their exact shape. */
import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { JWT_AUDIENCE, JWT_ISSUER } from '../src/admin/auth/auth.constants';
import { SearchIndexService } from '../src/search/index/search-index.service';
import { createFakeContentDb } from './support/fake-content-db';
import { createTestApp } from './support/test-app';

const COOKIE = 'qa_admin_session';

async function settled(app: NestExpressApplication): Promise<void> {
  const svc = app.get(SearchIndexService);
  for (let i = 0; i < 200; i++) {
    const { state } = svc.status();
    if (state === 'ready' || state === 'failed') return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error('search index build did not settle');
}

/** Every Phase 6 content route (method, path, body). */
const ROUTES: [string, string, object?][] = [
  ['get', '/admin/stats'],
  ['get', '/admin/suras'],
  ['patch', '/admin/suras/1', { nameEn: 'X' }],
  ['get', '/admin/topics'],
  ['get', '/admin/topics/1'],
  ['post', '/admin/topics', { title: 'new' }],
  ['patch', '/admin/topics/1', { title: 'x' }],
  ['delete', '/admin/topics/2'],
  ['get', '/admin/topics/1/ayahs'],
  ['post', '/admin/topics/1/ayahs', { ayahIds: [3] }],
  ['delete', '/admin/topics/1/ayahs/1'],
  ['get', '/admin/ayahs?sura=1'],
  ['get', '/admin/ayahs/lookup?refs=1:1'],
  ['get', '/admin/tafsir-books'],
  ['patch', '/admin/tafsir-books/1', { name: 'x' }],
  ['get', '/admin/tafsirs?ayah_id=1'],
];

describe('Admin content API (e2e, Phase 6)', () => {
  let app: NestExpressApplication;
  let fake: ReturnType<typeof createFakeContentDb>;
  let cookie: string;

  beforeEach(async () => {
    fake = createFakeContentDb();
    app = await createTestApp([], fake.db);
    await settled(app);
    cookie = `${COOKIE}=${await app.get(JwtService).signAsync({ sub: '7' })}`;
  });

  afterEach(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const call = (
    method: string,
    path: string,
    body?: object,
    withCookie: string | null = cookie,
  ) => {
    const req = (http() as unknown as Record<string, (p: string) => request.Test>)[method](path);
    if (withCookie) req.set('Cookie', withCookie);
    return body ? req.send(body) : req;
  };
  const writes = () =>
    fake.db.category.create.mock.calls.length +
    fake.db.category.update.mock.calls.length +
    fake.db.category.delete.mock.calls.length +
    fake.db.categoryAyah.createMany.mock.calls.length +
    fake.db.categoryAyah.deleteMany.mock.calls.length +
    fake.db.sura.update.mock.calls.length +
    fake.db.tafsirBook.update.mock.calls.length;

  // ---------------------------------------------------------------- authentication

  describe('authentication & authorization', () => {
    it.each(ROUTES.map(([m, p, b]) => ({ m, p, b })))(
      '$m $p -> 401 without a session, nothing written',
      async ({ m, p, b }) => {
        const res = await call(m, p, b, null).expect(401);
        expect(res.body).toMatchObject({ statusCode: 401, message: 'Authentication required' });
        expect(writes()).toBe(0);
      },
    );

    it('rejects expired, tampered, foreign-secret and wrong-audience tokens with the same 401', async () => {
      const jwt = app.get(JwtService);
      const expired = await jwt.signAsync({ sub: '7' }, { expiresIn: -10 });
      const foreign = new JwtService({ secret: 'z'.repeat(40) }).sign(
        { sub: '7' },
        { issuer: JWT_ISSUER, audience: JWT_AUDIENCE },
      );
      const wrongAud = await jwt.signAsync({ sub: '7' }, { audience: 'someone-else' });
      const noneAlg =
        Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url') +
        '.' +
        Buffer.from(JSON.stringify({ sub: '7', iss: JWT_ISSUER, aud: JWT_AUDIENCE })).toString(
          'base64url',
        ) +
        '.';
      for (const token of [expired, `${cookie.split('=')[1]}x`, foreign, wrongAud, noneAlg]) {
        const res = await call(
          'post',
          '/admin/topics',
          { title: 'x' },
          `${COOKIE}=${token}`,
        ).expect(401);
        expect(res.body.message).toBe('Authentication required');
      }
      expect(writes()).toBe(0);
    });

    it('ignores a bearer header and role hints: only the session cookie authenticates', async () => {
      const token = cookie.split('=')[1];
      await http()
        .get('/admin/stats')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Role', 'admin')
        .expect(401);
      await http().get('/admin/stats?role=admin').expect(401);
    });

    it('has no public registration or account-management endpoint', async () => {
      for (const p of [
        '/admin/auth/register',
        '/admin/auth/signup',
        '/admin/admins',
        '/admin/users',
      ]) {
        const res = await call('post', p, { email: 'a@b.co', password: 'x'.repeat(20) }, null);
        expect([401, 404]).toContain(res.status);
        const authed = await call('post', p, { email: 'a@b.co', password: 'x'.repeat(20) });
        expect(authed.status).toBe(404);
      }
    });

    it('rejects mass-assignment / privilege fields (unknown properties are a 400)', async () => {
      const cases: [string, string, object][] = [
        ['post', '/admin/topics', { title: 'x', role: 'superadmin' }],
        ['post', '/admin/topics', { title: 'x', id: 999 }],
        ['post', '/admin/topics', { title: 'x', isBanned: true }],
        ['post', '/admin/topics', { title: 'x', legacyUuid: 'u' }],
        ['patch', '/admin/topics/1', { titleRaw: 'x' }],
        ['patch', '/admin/topics/1', { id: 2 }],
        ['patch', '/admin/topics/1', { isAdmin: true }],
        ['patch', '/admin/suras/1', { ayahCount: 1 }],
        ['patch', '/admin/suras/1', { number: 2 }],
        ['patch', '/admin/tafsir-books/2', { hidden: false }],
        ['patch', '/admin/tafsir-books/1', { id: 9 }],
        ['post', '/admin/topics/1/ayahs', { ayahIds: [3], categoryId: 2 }],
      ];
      for (const [m, p, b] of cases) {
        const res = await call(m, p, b).expect(400);
        expect(res.body.statusCode).toBe(400);
      }
      expect(writes()).toBe(0);
    });

    it('offers no write path for ayah or tafsir text (read-only data)', async () => {
      for (const [m, p] of [
        ['patch', '/admin/ayahs/1'],
        ['put', '/admin/ayahs/1'],
        ['delete', '/admin/ayahs/1'],
        ['post', '/admin/ayahs'],
        ['post', '/admin/tafsirs'],
        ['patch', '/admin/tafsirs/1'],
        ['delete', '/admin/tafsirs/1'],
        ['post', '/admin/tafsir-books'],
        ['delete', '/admin/tafsir-books/1'],
        ['post', '/admin/suras'],
        ['delete', '/admin/suras/1'],
      ]) {
        await call(m, p, { textUthmani: 'x', content: 'x' }).expect(404);
      }
      expect(writes()).toBe(0);
    });
  });

  // ---------------------------------------------------------------- stats

  it('GET /admin/stats summarizes the content', async () => {
    const res = await call('get', '/admin/stats').expect(200);
    expect(res.body).toEqual({
      suras: 2,
      ayahs: 4,
      topics: { total: 4, banned: 1, hidden: 2 },
      topicLinks: 3,
      tafsirBooks: { total: 3, visible: 1 },
      tafsirs: 2,
    });
  });

  // ---------------------------------------------------------------- suras

  describe('suras', () => {
    it('lists all suras', async () => {
      const res = await call('get', '/admin/suras').expect(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0]).toEqual({
        number: 1,
        nameAr: 'الفاتحة',
        nameEn: 'Al-Fatiha',
        ayahCount: 2,
        revelationPlace: 'meccan',
      });
    });

    it('renames a sura (trimmed), reindexes, and reference search sees the new name', async () => {
      const res = await call('patch', '/admin/suras/112', {
        nameAr: '  التوحيد  ',
        nameEn: 'Tawhid ',
      }).expect(200);
      expect(res.body).toEqual({
        sura: expect.objectContaining({ number: 112, nameAr: 'التوحيد', nameEn: 'Tawhid' }),
        reindex: 'done',
      });
      const search = await http().get('/search').query({ q: 'التوحيد 2' }).expect(200);
      expect(search.body.results[0]).toMatchObject({ ayahId: 4, matchType: 'reference' });
    });

    it('English-only rename does not rebuild the index', async () => {
      const rebuild = jest.spyOn(app.get(SearchIndexService), 'rebuild');
      await call('patch', '/admin/suras/1', { nameEn: 'The Opening' }).expect(200);
      expect(rebuild).not.toHaveBeenCalled();
    });

    it('reports reindex=failed (but keeps the rename) when the rebuild fails', async () => {
      jest
        .spyOn(app.get(SearchIndexService), 'rebuild')
        .mockRejectedValueOnce(new Error('db down'));
      const res = await call('patch', '/admin/suras/1', { nameAr: 'أم الكتاب' }).expect(200);
      expect(res.body.reindex).toBe('failed');
      expect(fake.state.suras[0].nameAr).toBe('أم الكتاب');
    });

    it.each([
      ['/admin/suras/1', {}, 400],
      ['/admin/suras/1', { nameAr: '   ' }, 400],
      ['/admin/suras/1', { nameAr: 'x'.repeat(61) }, 400],
      ['/admin/suras/1', { nameAr: 5 }, 400],
      ['/admin/suras/1', { nameAr: 'Latin only' }, 400],
      ['/admin/suras/0', { nameEn: 'x' }, 400],
      ['/admin/suras/115', { nameEn: 'x' }, 400],
      ['/admin/suras/1.5', { nameEn: 'x' }, 400],
      ['/admin/suras/2', { nameEn: 'x' }, 404],
      ['/admin/suras/1', { nameAr: 'الاخلاص' }, 409], // same name as 112 after normalization
      ['/admin/suras/1', { nameEn: 'al-ikhlas' }, 409],
    ])('PATCH %s %j -> %i', async (p, body, status) => {
      await call('patch', p, body).expect(status);
      expect(fake.db.sura.update).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------- topics

  describe('topics', () => {
    it('lists every topic, banned included, with hidden flags and counts; never internal columns', async () => {
      const res = await call('get', '/admin/topics').expect(200);
      expect(res.body.pagination).toEqual({ page: 1, limit: 50, total: 4, totalPages: 1 });
      expect(res.body.data).toEqual([
        {
          id: 1,
          parentId: null,
          title: 'الدعاء',
          description: null,
          isBanned: false,
          hidden: false,
          ayahCount: 2,
          childrenCount: 1,
        },
        {
          id: 2,
          parentId: 1,
          title: 'أدعية الأنبياء',
          description: null,
          isBanned: false,
          hidden: false,
          ayahCount: 1,
          childrenCount: 0,
        },
        {
          id: 3,
          parentId: null,
          title: 'محظور',
          description: null,
          isBanned: true,
          hidden: true,
          ayahCount: 0,
          childrenCount: 1,
        },
        {
          id: 4,
          parentId: 3,
          title: 'تحت المحظور',
          description: null,
          isBanned: false,
          hidden: true,
          ayahCount: 0,
          childrenCount: 0,
        },
      ]);
      expect(JSON.stringify(res.body)).not.toMatch(/legacyUuid|titleRaw|uuid-|raw-/);
    });

    it('filters by status, searches with normalization, and paginates', async () => {
      const ids = async (q: Record<string, string>) =>
        (
          (await call('get', `/admin/topics?${new URLSearchParams(q).toString()}`).expect(200)).body
            .data as {
            id: number;
          }[]
        ).map((t) => t.id);
      expect(await ids({ status: 'banned' })).toEqual([3]);
      expect(await ids({ status: 'visible' })).toEqual([1, 2]);
      expect(await ids({ q: 'ادعيه' })).toEqual([2]); // أدعية, spelled without hamza / ta marbuta
      expect(await ids({ q: '4' })).toEqual([4]); // by id
      expect(await ids({ limit: '2', page: '2' })).toEqual([3, 4]);
    });

    it.each([
      ['status=deleted'],
      ['page=0'],
      ['limit=101'],
      ['sort=title'],
      [`q=${'x'.repeat(101)}`],
    ])('GET /admin/topics?%s -> 400', async (qs) => {
      await call('get', `/admin/topics?${qs}`).expect(400);
    });

    it('returns details with parent and children; 404 for missing; 400 for bad ids', async () => {
      const res = await call('get', '/admin/topics/1').expect(200);
      expect(res.body).toMatchObject({
        id: 1,
        parent: null,
        children: [{ id: 2, title: 'أدعية الأنبياء', isBanned: false }],
      });
      expect((await call('get', '/admin/topics/4').expect(200)).body.parent).toEqual({
        id: 3,
        title: 'محظور',
      });
      await call('get', '/admin/topics/999').expect(404);
      for (const bad of ['0', '-1', '1.5', 'abc', '1e2'])
        await call('get', `/admin/topics/${bad}`).expect(400);
    });

    it('creates a topic (trimmed, never banned on create) and it shows up publicly', async () => {
      const res = await call('post', '/admin/topics', {
        title: '  التوبة ',
        description: '  وصف ',
        parentId: 1,
      }).expect(201);
      expect(res.body).toMatchObject({
        id: 5,
        title: 'التوبة',
        description: 'وصف',
        parentId: 1,
        isBanned: false,
        hidden: false,
        parent: { id: 1, title: 'الدعاء' },
      });
      const pub = await http().get('/topics').expect(200);
      expect((pub.body.data as { id: number }[]).map((t) => t.id)).toContain(5);
      await call('post', '/admin/topics', { title: 'جذر', parentId: null }).expect(201);
    });

    it.each([
      [{}, 400],
      [{ title: '' }, 400],
      [{ title: '   ' }, 400],
      [{ title: 'x'.repeat(256) }, 400],
      [{ title: 7 }, 400],
      [{ title: 'ok', parentId: '1' }, 400],
      [{ title: 'ok', parentId: 1.5 }, 400],
      [{ title: 'ok', parentId: 0 }, 400],
      [{ title: 'ok', parentId: 999 }, 400], // parent must exist
      [{ title: 'ok', description: 'x'.repeat(5001) }, 400],
      [{ title: 'ـــ' }, 400], // only tatweel -> empty after normalization
      [{ title: 'الدعاء' }, 409], // duplicate at root
      [{ title: 'ادعيه الانبياء', parentId: 1 }, 409], // duplicate sibling (spelling variant)
    ])('POST /admin/topics %j -> %i', async (body, status) => {
      await call('post', '/admin/topics', body).expect(status);
      expect(fake.db.category.create).not.toHaveBeenCalled();
    });

    it('allows the same title under a different parent', async () => {
      await call('post', '/admin/topics', { title: 'الدعاء', parentId: 3 }).expect(201);
    });

    it('updates fields; clears description with an empty string', async () => {
      await call('patch', '/admin/topics/2', { description: 'شيء' }).expect(200);
      const res = await call('patch', '/admin/topics/2', {
        title: 'أدعية',
        description: '',
      }).expect(200);
      expect(res.body).toMatchObject({ title: 'أدعية', description: null });
    });

    it('banning hides the topic and its subtree from the public API; unbanning restores them', async () => {
      await call('patch', '/admin/topics/1', { isBanned: true }).expect(200);
      expect((await http().get('/topics').expect(200)).body.data).toEqual([]);
      await http().get('/topics/2').expect(404);
      const list = await call('get', '/admin/topics?status=visible').expect(200);
      expect(list.body.data).toEqual([]);

      await call('patch', '/admin/topics/1', { isBanned: false }).expect(200);
      expect((await http().get('/topics').expect(200)).body.data).toHaveLength(2);
    });

    it('moves a topic, and rejects cycles / self-parenting / missing parents', async () => {
      const moved = await call('patch', '/admin/topics/2', { parentId: 3 }).expect(200);
      expect(moved.body).toMatchObject({ parentId: 3, hidden: true });
      await call('patch', '/admin/topics/2', { parentId: null }).expect(200);

      await call('patch', '/admin/topics/3', { parentId: 4 }).expect(400); // 4 is a child of 3
      await call('patch', '/admin/topics/1', { parentId: 1 }).expect(400);
      await call('patch', '/admin/topics/1', { parentId: 999 }).expect(400);
    });

    it('moving into a parent that already has the same title is a 409', async () => {
      await call('post', '/admin/topics', { title: 'أدعية الأنبياء', parentId: 3 }).expect(201);
      await call('patch', '/admin/topics/2', { parentId: 3 }).expect(409);
    });

    it.each([
      ['/admin/topics/1', {}, 400],
      ['/admin/topics/1', { isBanned: 'true' }, 400],
      ['/admin/topics/1', { title: null }, 400],
      ['/admin/topics/999', { title: 'x' }, 404],
    ])('PATCH %s %j -> %i', async (p, body, status) => {
      await call('patch', p, body).expect(status);
      expect(fake.db.category.update).not.toHaveBeenCalled();
    });

    it('PATCH renaming to a sibling title is a 409; the same title elsewhere is fine', async () => {
      await call('post', '/admin/topics', { title: 'الصبر' }).expect(201);
      await call('patch', '/admin/topics/1', { title: 'الصبر' }).expect(409);
      // 2 lives under 1, so the root title 'الدعاء' does not clash with it.
      await call('patch', '/admin/topics/2', { title: 'الدعاء' }).expect(200);
    });

    it('delete: 409 with children, 204 for a leaf (links cascade, ayahs untouched), then 404', async () => {
      await call('delete', '/admin/topics/1').expect(409);
      await call('delete', '/admin/topics/2').expect(204);
      expect(fake.state.links().some((l) => l.categoryId === 2)).toBe(false);
      expect(fake.state.ayahs).toHaveLength(4);
      await call('delete', '/admin/topics/2').expect(404);
      await call('get', '/admin/topics/2').expect(404);
      await call('delete', '/admin/topics/1').expect(204); // now a leaf
    });
  });

  // ---------------------------------------------------------------- links

  describe('topic <-> ayah links', () => {
    it('lists linked ayahs (paginated, mushaf order)', async () => {
      const res = await call('get', '/admin/topics/1/ayahs?limit=1').expect(200);
      expect(res.body.pagination).toEqual({ page: 1, limit: 1, total: 2, totalPages: 2 });
      expect(res.body.data[0]).toMatchObject({ id: 1, suraNumber: 1, ayahNumber: 1 });
      await call('get', '/admin/topics/999/ayahs').expect(404);
    });

    it('links new ayahs, reports duplicates as skipped, and dedupes the request', async () => {
      const res = await call('post', '/admin/topics/1/ayahs', { ayahIds: [1, 3, 3, 4, 2] }).expect(
        200,
      );
      expect(res.body).toEqual({ added: [3, 4], skipped: [1, 2] });
      const again = await call('post', '/admin/topics/1/ayahs', { ayahIds: [3] }).expect(200);
      expect(again.body).toEqual({ added: [], skipped: [3] });
    });

    it('unknown ayahs -> 404 and nothing is linked', async () => {
      const res = await call('post', '/admin/topics/1/ayahs', { ayahIds: [3, 9999] }).expect(404);
      expect(res.body.message).toContain('9999');
      expect(fake.db.categoryAyah.createMany).not.toHaveBeenCalled();
    });

    it.each([
      [{ ayahIds: [] }],
      [{ ayahIds: ['3'] }],
      [{ ayahIds: [1.5] }],
      [{ ayahIds: [0] }],
      [{ ayahIds: '3' }],
      [{ ayahIds: Array.from({ length: 101 }, (_, i) => i + 1) }],
      [{}],
    ])('POST links %j -> 400', async (body) => {
      await call('post', '/admin/topics/1/ayahs', body).expect(400);
    });

    it('links to a missing topic -> 404', async () => {
      await call('post', '/admin/topics/999/ayahs', { ayahIds: [1] }).expect(404);
    });

    it('unlinks; a second unlink (or a missing topic) is a 404', async () => {
      await call('delete', '/admin/topics/1/ayahs/2').expect(204);
      await call('delete', '/admin/topics/1/ayahs/2').expect(404);
      await call('delete', '/admin/topics/999/ayahs/1').expect(404);
      await call('delete', '/admin/topics/1/ayahs/abc').expect(400);
      expect(fake.state.ayahs).toHaveLength(4); // the ayah itself is never deleted
    });
  });

  // ---------------------------------------------------------------- ayahs (read-only)

  describe('ayahs (read-only)', () => {
    it('lists a sura with its ayahs', async () => {
      const res = await call('get', '/admin/ayahs?sura=112').expect(200);
      expect(res.body.sura).toMatchObject({ number: 112, ayahCount: 2 });
      expect(res.body.data.map((a: { ayahNumber: number }) => a.ayahNumber)).toEqual([1, 2]);
      expect(res.body.pagination.total).toBe(2);
    });

    it('looks up ayahs by reference in one call (request order, deduplicated, missing listed)', async () => {
      const res = await call('get', '/admin/ayahs/lookup?refs=112:2,1:1,112:9,01:1,112:2').expect(
        200,
      );
      expect(res.body.data.map((a: { id: number }) => a.id)).toEqual([4, 1]);
      expect(res.body.missing).toEqual(['112:9']);
      const many = Array.from({ length: 100 }, (_, i) => `1:${i + 1}`).join(',');
      await call('get', `/admin/ayahs/lookup?refs=${many}`).expect(200);
      await call('get', `/admin/ayahs/lookup?refs=${many},2:1`).expect(400);
    });

    it.each([
      '/admin/ayahs',
      '/admin/ayahs?sura=0',
      '/admin/ayahs?sura=115',
      '/admin/ayahs/lookup',
      '/admin/ayahs/lookup?ref=2:255',
      '/admin/ayahs/lookup?refs=2-255',
      '/admin/ayahs/lookup?refs=2:255:1',
      '/admin/ayahs/lookup?refs=2:255,',
      '/admin/ayahs/lookup?refs=2:255&refs=1:1',
    ])('GET %s -> 400', async (p) => {
      await call('get', p).expect(400);
    });

    it('404 for a sura that is not in the table', async () => {
      await call('get', '/admin/ayahs?sura=2').expect(404);
    });
  });

  // ---------------------------------------------------------------- tafsir

  describe('tafsir books & tafsirs', () => {
    it('lists every book, hidden ones flagged, with non-empty tafsir counts', async () => {
      const res = await call('get', '/admin/tafsir-books').expect(200);
      expect(res.body.data).toEqual([
        { id: 0, name: 'placeholder', author: null, hidden: true, tafsirCount: 0 },
        { id: 1, name: 'تفسير القرطبي', author: 'القرطبي', hidden: false, tafsirCount: 1 },
        { id: 2, name: 'غير متوفر لهذه الآية', author: null, hidden: true, tafsirCount: 1 },
      ]);
    });

    it('edits name / author (author "" clears it); visibility is not changed by an edit', async () => {
      const res = await call('patch', '/admin/tafsir-books/2', {
        name: ' تفسير الجلالين ',
        author: 'الجلالين',
      }).expect(200);
      expect(res.body).toEqual({
        id: 2,
        name: 'تفسير الجلالين',
        author: 'الجلالين',
        hidden: true,
        tafsirCount: 1,
      });
      const cleared = await call('patch', '/admin/tafsir-books/2', { author: '' }).expect(200);
      expect(cleared.body.author).toBeNull();
      // The public API still hides book 2.
      expect(
        (await http().get('/tafsir-books').expect(200)).body.data.map((b: { id: number }) => b.id),
      ).toEqual([1]);
    });

    it.each([
      ['/admin/tafsir-books/1', {}, 400],
      ['/admin/tafsir-books/1', { name: '' }, 400],
      ['/admin/tafsir-books/1', { name: 'x'.repeat(101) }, 400],
      ['/admin/tafsir-books/1', { author: 'x'.repeat(151) }, 400],
      ['/admin/tafsir-books/256', { name: 'x' }, 400],
      ['/admin/tafsir-books/9', { name: 'x' }, 404],
    ])('PATCH %s %j -> %i', async (p, body, status) => {
      await call('patch', p, body).expect(status);
      expect(fake.db.tafsirBook.update).not.toHaveBeenCalled();
    });

    it('shows every tafsir of an ayah (hidden books flagged) to the admin only', async () => {
      const res = await call('get', '/admin/tafsirs?ayah_id=1').expect(200);
      expect(res.body.ayah).toMatchObject({ id: 1 });
      expect(res.body.data).toEqual([
        { bookId: 1, bookName: 'تفسير القرطبي', hidden: false, content: 'tafsir 1/1' },
        {
          bookId: 2,
          bookName: 'غير متوفر لهذه الآية',
          hidden: true,
          content: 'tafsir 1/2 (hidden book)',
        },
      ]);
      // Public endpoint still never serves the hidden book.
      const pub = await http().get('/tafsirs?ayah_id=1&book_ids=1,2').expect(200);
      expect(JSON.stringify(pub.body)).not.toContain('hidden book');

      await call('get', '/admin/tafsirs?ayah_id=999').expect(404);
      await call('get', '/admin/tafsirs').expect(400);
      await call('get', '/admin/tafsirs?ayah_id=1&book_ids=2').expect(400);
    });
  });
});
