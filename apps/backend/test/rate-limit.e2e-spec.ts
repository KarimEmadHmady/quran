import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { App } from 'supertest/types';
import { createTestApp } from './support/test-app';
import { TestController } from './support/test.controller';

// Default limits from env.validation.ts: default 100/min, auth 5/min, search 30/min.
describe('Rate limiting (e2e)', () => {
  let app: NestExpressApplication;
  let server: App;

  beforeEach(async () => {
    // Fresh app per test = fresh in-memory throttler storage.
    app = await createTestApp([TestController]);
    server = app.getHttpServer();
  });

  afterEach(async () => {
    await app.close();
  });

  it('the 101st request in a minute gets 429 with Retry-After (default throttler)', async () => {
    for (let i = 1; i <= 100; i++) {
      const res = await request(server).get('/health');
      if (res.status !== 200) throw new Error(`request ${i} returned ${res.status}`);
    }
    // 100 requests passed, which also proves the 5/min `auth` limit is NOT applied to /health.

    const res = await request(server).get('/health').expect(429);
    const retryAfter = Number(res.headers['retry-after']);
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(60);
    expect(res.body).toEqual(
      expect.objectContaining({
        statusCode: 429,
        error: 'Too Many Requests',
        message: 'Too many requests, please try again later.',
        path: '/health',
      }),
    );
  }, 30_000);

  it('the opt-in `search` throttler blocks the 31st request; other routes keep working', async () => {
    for (let i = 1; i <= 30; i++) {
      const res = await request(server).get('/__test/search');
      if (res.status !== 200) throw new Error(`request ${i} returned ${res.status}`);
    }
    const blocked = await request(server).get('/__test/search').expect(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThanOrEqual(1);

    // `default` has only used 31/100, so non-search routes are unaffected.
    await request(server).get('/health').expect(200);
  }, 30_000);
});
