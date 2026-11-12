import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { App } from 'supertest/types';
import { createTestApp } from './support/test-app';
import { TestController } from './support/test.controller';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ALLOWED_ORIGIN = 'http://localhost:3000'; // from test/setup-env.ts

function expectErrorShape(body: Record<string, unknown>, status: number, requestId?: string) {
  expect(body).toEqual(
    expect.objectContaining({
      statusCode: status,
      error: expect.any(String) as string,
      message: expect.any(String) as string,
      path: expect.any(String) as string,
      timestamp: expect.any(String) as string,
      requestId: requestId ?? (expect.any(String) as string),
    }),
  );
  expect(body).not.toHaveProperty('stack');
}

describe('Security baseline (e2e)', () => {
  let app: NestExpressApplication;
  let server: App;

  beforeAll(async () => {
    app = await createTestApp([TestController]);
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('helmet', () => {
    it('sets security headers and hides x-powered-by', async () => {
      const res = await request(server).get('/health').expect(200);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(res.headers['content-security-policy']).toBeDefined();
      expect(res.headers['strict-transport-security']).toBeDefined();
      expect(res.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('CORS', () => {
    it('allows the configured origin with credentials', async () => {
      const res = await request(server).get('/health').set('Origin', ALLOWED_ORIGIN).expect(200);
      expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('gives other origins no CORS headers', async () => {
      const res = await request(server).get('/health').set('Origin', 'https://evil.example');
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('answers preflight for the allowed origin only', async () => {
      const ok = await request(server)
        .options('/__test/echo')
        .set('Origin', ALLOWED_ORIGIN)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'content-type');
      expect(ok.status).toBe(204);
      expect(ok.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
      expect(ok.headers['access-control-allow-methods']).toContain('POST');

      const bad = await request(server)
        .options('/__test/echo')
        .set('Origin', 'https://evil.example')
        .set('Access-Control-Request-Method', 'POST');
      expect(bad.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('request id', () => {
    it('generates one when missing', async () => {
      const res = await request(server).get('/health');
      expect(res.headers['x-request-id']).toMatch(UUID);
    });

    it('keeps a safe incoming id and puts it in error bodies', async () => {
      const res = await request(server).get('/nope').set('X-Request-Id', 'trace-12345678');
      expect(res.headers['x-request-id']).toBe('trace-12345678');
      expect((res.body as { requestId: string }).requestId).toBe('trace-12345678');
    });
  });

  describe('consistent error shape (never 500 for bad input)', () => {
    it('404 for unknown routes', async () => {
      const res = await request(server).get('/does-not-exist?token=abc').expect(404);
      const body = res.body as Record<string, unknown>;
      expectErrorShape(body, 404, res.headers['x-request-id']);
      expect(body.path).toBe('/does-not-exist');
      expect(JSON.stringify(body)).not.toContain('token');
    });

    it('400 with details for unknown properties (whitelist + forbidNonWhitelisted)', async () => {
      const res = await request(server)
        .post('/__test/echo')
        .send({ text: 'hi', isAdmin: true })
        .expect(400);
      const body = res.body as Record<string, unknown>;
      expectErrorShape(body, 400);
      expect(body.message).toBe('Validation failed');
      expect(body.details).toContain('property isAdmin should not exist');
    });

    it('400 for wrong types', async () => {
      const res = await request(server)
        .post('/__test/echo')
        .send({ text: 123, count: 'many' })
        .expect(400);
      expect((res.body as { details: string[] }).details).toEqual(
        expect.arrayContaining(['text must be a string', 'count must be an integer number']),
      );
    });

    it('400 for malformed JSON', async () => {
      const res = await request(server)
        .post('/__test/echo')
        .set('Content-Type', 'application/json')
        .send('{"text": "unterminated')
        .expect(400);
      expectErrorShape(res.body as Record<string, unknown>, 400);
    });

    it('413 for bodies over BODY_LIMIT (100kb)', async () => {
      const res = await request(server)
        .post('/__test/echo')
        .send({ text: 'a'.repeat(150 * 1024) })
        .expect(413);
      expectErrorShape(res.body as Record<string, unknown>, 413);
    });

    it('414 for URLs over MAX_URL_LENGTH (8192)', async () => {
      const res = await request(server)
        .get(`/health?q=${'a'.repeat(9000)}`)
        .expect(414);
      expectErrorShape(res.body as Record<string, unknown>, 414);
    });

    it('500 for unexpected errors, with no stack trace in the response', async () => {
      const res = await request(server).get('/__test/boom').expect(500);
      const body = res.body as Record<string, unknown>;
      expectErrorShape(body, 500);
      expect(JSON.stringify(body)).not.toMatch(/at [A-Za-z]|\.ts:[0-9]+/);
    });
  });

  describe('compression', () => {
    it('gzips large responses when the client accepts it', async () => {
      const res = await request(server)
        .get('/__test/big')
        .set('Accept-Encoding', 'gzip')
        .expect(200);
      expect(res.headers['content-encoding']).toBe('gzip');
      expect((res.body as { items: unknown[] }).items).toHaveLength(500);
    });
  });

  describe('Arabic round-trip (utf8 end to end)', () => {
    it('returns Arabic with diacritics byte-for-byte unchanged', async () => {
      // "bismi Allahi ar-rahmani ar-rahim" with full tashkeel, built from code points.
      const text = String.fromCodePoint(
        0x0628,
        0x0650,
        0x0633,
        0x0652,
        0x0645,
        0x0650,
        0x0020,
        0x0671,
        0x0644,
        0x0644,
        0x0651,
        0x064e,
        0x0647,
        0x0650,
        0x0020,
        0x0671,
        0x0644,
        0x0631,
        0x0651,
        0x064e,
        0x062d,
        0x0652,
        0x0645,
        0x064e,
        0x0670,
        0x0646,
        0x0650,
      );
      const res = await request(server).post('/__test/echo').send({ text }).expect(201);
      expect(res.headers['content-type']).toMatch(/charset=utf-8/i);
      expect((res.body as { text: string }).text).toBe(text);
    });
  });
});
