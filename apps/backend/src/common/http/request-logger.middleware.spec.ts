import { EventEmitter } from 'node:events';
import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { createRequestLogger, formatAccessLog } from './request-logger.middleware';

describe('formatAccessLog', () => {
  it('logs method, path, status, duration and request id', () => {
    expect(
      formatAccessLog({
        method: 'GET',
        originalUrl: '/suras/1',
        status: 200,
        durationMs: 3.456,
        requestId: 'rid-12345678',
      }),
    ).toBe('GET /suras/1 200 3.5ms rid=rid-12345678');
  });

  it('never logs the query string', () => {
    const line = formatAccessLog({
      method: 'GET',
      originalUrl: '/search?q=secret&token=abc',
      status: 200,
      durationMs: 1,
      requestId: undefined,
    });
    expect(line).toBe('GET /search 200 1.0ms rid=-');
  });

  it('replaces non-printable characters and truncates very long paths', () => {
    const line = formatAccessLog({
      method: 'GET',
      originalUrl: `/a${String.fromCharCode(10)}FAKE/${'x'.repeat(500)}`,
      status: 404,
      durationMs: 1,
      requestId: undefined,
    });
    expect(line).not.toContain(String.fromCharCode(10));
    expect(line).toContain('/a?FAKE/');
    expect(line).toContain('...');
    expect(line.length).toBeLessThan(260);
  });
});

describe('createRequestLogger', () => {
  function makeLogger() {
    const logger = new Logger('HTTP-test');
    return {
      logger,
      log: jest.spyOn(logger, 'log').mockImplementation(() => undefined),
      warn: jest.spyOn(logger, 'warn').mockImplementation(() => undefined),
      error: jest.spyOn(logger, 'error').mockImplementation(() => undefined),
    };
  }

  function runRequest(status: number) {
    const spies = makeLogger();
    const middleware = createRequestLogger(spies.logger);
    const req = {
      method: 'POST',
      originalUrl: '/admin/auth/login?next=/x',
      headers: {
        'x-request-id': 'rid-12345678',
        cookie: 'session=SECRET_COOKIE',
        authorization: 'Bearer SECRET_TOKEN',
      },
      body: { email: 'a@b.c', password: 'SECRET_PASSWORD' },
    } as unknown as Request;
    const res = Object.assign(new EventEmitter(), { statusCode: status }) as unknown as Response;
    const next: NextFunction = jest.fn();
    middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    res.emit('finish');
    return spies;
  }

  it('logs 2xx at log level, without body, cookies, tokens or query', () => {
    const { log, warn, error } = runRequest(200);
    expect(log).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    const line = String(log.mock.calls[0][0]);
    expect(line).toMatch(/^POST \/admin\/auth\/login 200 [0-9.]+ms rid=rid-12345678$/);
    for (const secret of ['SECRET_COOKIE', 'SECRET_TOKEN', 'SECRET_PASSWORD', 'a@b.c', 'next=']) {
      expect(line).not.toContain(secret);
    }
  });

  it('logs 4xx as warn and 5xx as error', () => {
    expect(runRequest(429).warn).toHaveBeenCalledTimes(1);
    expect(runRequest(500).error).toHaveBeenCalledTimes(1);
  });
});
