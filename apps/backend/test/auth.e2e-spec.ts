import './support/trust-loopback-proxy'; // must stay first: lets tests vary the client IP
import type { NestExpressApplication } from '@nestjs/platform-express';
import { hashSync } from 'bcryptjs';
import request from 'supertest';
import type { App } from 'supertest/types';
import { createTestApp } from './support/test-app';

const PASSWORD = 'correct horse battery staple';
const ADMIN = {
  id: 7,
  email: 'admin@example.com',
  name: 'Admin',
  passwordHash: hashSync(PASSWORD, 4), // low cost for test speed; the seed script uses 12
  createdAt: new Date('2026-01-01T00:00:00Z'),
  lastLoginAt: null,
};
const COOKIE = 'qa_admin_session';

type Query = { where: { email?: string; id?: number }; select: Record<string, boolean> };

/** Behaves like Prisma for the queries used: honours `where` and `select`. */
function prismaStub() {
  return {
    admin: {
      findUnique: jest.fn(({ where, select }: Query) => {
        const hit = where.email === ADMIN.email || where.id === ADMIN.id;
        const row = Object.fromEntries(
          Object.keys(select).map((k) => [k, ADMIN[k as keyof typeof ADMIN]]),
        );
        return Promise.resolve(hit ? row : null);
      }),
      update: jest.fn().mockResolvedValue(ADMIN),
    },
  };
}

/** Each call gets its own client IP so the per-IP `auth` throttler does not interfere. */
let ipCounter = 0;
const nextIp = () => `203.0.113.${++ipCounter % 250}`;

function sessionCookie(res: request.Response): string {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = raw?.find((c) => c.startsWith(`${COOKIE}=`));
  if (!cookie) throw new Error('no session cookie');
  return cookie;
}

const stripVolatile = (body: Record<string, unknown>) => {
  const { requestId: _r, timestamp: _t, ...rest } = body;
  void _r;
  void _t;
  return rest;
};

describe('Admin auth (e2e, Prisma stubbed)', () => {
  let app: NestExpressApplication;
  let server: App;
  let prisma: ReturnType<typeof prismaStub>;

  beforeEach(async () => {
    prisma = prismaStub();
    app = await createTestApp([], prisma); // fresh app = fresh throttler + lockout state
    server = app.getHttpServer();
  });

  afterEach(async () => {
    await app.close();
  });

  const login = (body: object, ip = nextIp()) =>
    request(server).post('/admin/auth/login').set('X-Forwarded-For', ip).send(body);

  it('login success: 200, httpOnly SameSite=Lax cookie on /admin, no token in the body', async () => {
    const res = await login({ email: 'Admin@Example.com', password: PASSWORD }).expect(200);

    expect(res.body).toEqual({ admin: { id: 7, email: 'admin@example.com', name: 'Admin' } });
    const cookie = sessionCookie(res);
    expect(cookie).toMatch(/; HttpOnly/);
    expect(cookie).toMatch(/; SameSite=Lax/);
    expect(cookie).toMatch(/; Path=\/admin/);
    expect(cookie).toMatch(/; Max-Age=28800/);
    expect(cookie).not.toMatch(/; Secure/); // Secure is production-only (unit-tested)
    const token = cookie.split(';')[0].split('=')[1];
    expect(JSON.stringify(res.body)).not.toContain(token);
    expect(prisma.admin.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { lastLoginAt: expect.any(Date) as Date },
    });
  });

  it('GET /admin/auth/me with the cookie returns the profile (no password hash)', async () => {
    const cookie = sessionCookie(await login({ email: ADMIN.email, password: PASSWORD }));
    const res = await request(server)
      .get('/admin/auth/me')
      .set('Cookie', cookie.split(';')[0])
      .expect(200);
    expect(res.body).toEqual({
      id: 7,
      email: 'admin@example.com',
      name: 'Admin',
      createdAt: '2026-01-01T00:00:00.000Z',
      lastLoginAt: null,
    });
  });

  it('protected route without a cookie: 401', async () => {
    const res = await request(server).get('/admin/auth/me').expect(401);
    expect(res.body).toMatchObject({ statusCode: 401, message: 'Authentication required' });
  });

  it.each([
    ['tampered token', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI3In0.bad'],
    ['empty token', ''],
  ])('protected route with a %s: 401', async (_label, value) => {
    await request(server).get('/admin/auth/me').set('Cookie', `${COOKIE}=${value}`).expect(401);
  });

  it('wrong password and unknown email get the same 401 response', async () => {
    const wrong = await login({ email: ADMIN.email, password: 'wrong password' }).expect(401);
    const unknown = await login({ email: 'nobody@example.com', password: PASSWORD }).expect(401);

    expect(stripVolatile(wrong.body as Record<string, unknown>)).toEqual(
      stripVolatile(unknown.body as Record<string, unknown>),
    );
    expect(wrong.body).toMatchObject({ statusCode: 401, message: 'Invalid email or password' });
    expect(wrong.headers['set-cookie']).toBeUndefined();
    expect(prisma.admin.update).not.toHaveBeenCalled();
  });

  it('per-email lockout: 5 failures (from 5 IPs), then the 6th attempt is 429 even with the right password', async () => {
    for (let i = 1; i <= 5; i++) {
      await login({ email: ADMIN.email, password: `wrong-${i}` }).expect(401);
    }
    const sixth = await login({ email: ADMIN.email, password: PASSWORD }).expect(429);
    expect(sixth.body).toMatchObject({
      statusCode: 429,
      message: 'Too many failed login attempts. Please try again later.',
    });
    const retryAfter = Number(sixth.headers['retry-after']);
    expect(retryAfter).toBeGreaterThan(890);
    expect(retryAfter).toBeLessThanOrEqual(900);
    expect(sixth.headers['set-cookie']).toBeUndefined();

    // Other emails are not affected.
    await login({ email: 'nobody@example.com', password: 'x' }).expect(401);
  }, 30_000);

  it('per-IP `auth` throttler: the 6th login from one IP in a minute is 429; other routes still work', async () => {
    const ip = '198.51.100.9';
    for (let i = 1; i <= 5; i++) {
      await login({ email: `user${i}@example.com`, password: 'x' }, ip).expect(401);
    }
    const sixth = await login({ email: 'user6@example.com', password: 'x' }, ip).expect(429);
    expect(Number(sixth.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    await request(server).get('/health').set('X-Forwarded-For', ip).expect(200);
  }, 30_000);

  it('logout: 204 and the cookie is cleared with the same attributes', async () => {
    const res = await request(server).post('/admin/auth/logout').expect(204);
    const cookie = sessionCookie(res);
    expect(cookie).toMatch(/^qa_admin_session=;/);
    expect(cookie).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect(cookie).toMatch(/; Path=\/admin/);
    expect(cookie).toMatch(/; HttpOnly/);
  });

  it.each([
    ['missing password', { email: ADMIN.email }],
    ['invalid email', { email: 'not-an-email', password: 'x' }],
    ['empty password', { email: ADMIN.email, password: '' }],
    ['non-string password', { email: ADMIN.email, password: 123 }],
    ['unknown field', { email: ADMIN.email, password: 'x', admin: true }],
    ['oversized password', { email: ADMIN.email, password: 'x'.repeat(257) }],
  ])('login validation: %s -> 400 (no lockout counted)', async (_label, body) => {
    await login(body).expect(400);
    expect(prisma.admin.findUnique).not.toHaveBeenCalled();
  });

  it('a form-encoded (cross-site form) login is rejected with 400: only JSON is parsed', async () => {
    await request(server)
      .post('/admin/auth/login')
      .set('X-Forwarded-For', nextIp())
      .type('form')
      .send({ email: ADMIN.email, password: PASSWORD })
      .expect(400);
  });

  it('unauthenticated requests to protected routes are still rate-limited (throttler runs first)', async () => {
    const ip = '198.51.100.77';
    for (let i = 1; i <= 100; i++) {
      const res = await request(server).get('/admin/auth/me').set('X-Forwarded-For', ip);
      if (res.status !== 401) throw new Error(`request ${i} returned ${res.status}`);
    }
    await request(server).get('/admin/auth/me').set('X-Forwarded-For', ip).expect(429);
  }, 30_000);
});
