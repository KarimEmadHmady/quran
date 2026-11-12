import type { NextFunction, Request, Response } from 'express';
import { getRequestId, isSafeRequestId, requestIdMiddleware } from './request-id.middleware';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function run(incoming?: string | string[]) {
  const req = { headers: incoming === undefined ? {} : { 'x-request-id': incoming } } as Request;
  const setHeader = jest.fn();
  const res = { setHeader } as unknown as Response;
  const next: NextFunction = jest.fn();
  requestIdMiddleware(req, res, next);
  return { req, setHeader, next };
}

describe('requestIdMiddleware', () => {
  it('generates a UUID when none is supplied and calls next', () => {
    const { req, setHeader, next } = run();
    const id = getRequestId(req);
    expect(id).toMatch(UUID);
    expect(setHeader).toHaveBeenCalledWith('X-Request-Id', id);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('keeps a safe incoming id (e.g. from a reverse proxy)', () => {
    const { req, setHeader } = run('proxy-abc_123.XYZ');
    expect(getRequestId(req)).toBe('proxy-abc_123.XYZ');
    expect(setHeader).toHaveBeenCalledWith('X-Request-Id', 'proxy-abc_123.XYZ');
  });

  it.each([
    ['too short', 'abc'],
    ['spaces / log injection', 'abc def ghi INFO fake log line'],
    ['newline', 'abcdefgh\nINFO forged'],
    ['too long', 'a'.repeat(129)],
    ['array header', ['abcdefgh1', 'abcdefgh2']],
  ])('replaces an unsafe incoming id (%s)', (_label, value) => {
    const { req } = run(value);
    expect(getRequestId(req)).toMatch(UUID);
  });

  it('isSafeRequestId rejects non-strings', () => {
    expect(isSafeRequestId(undefined)).toBe(false);
    expect(isSafeRequestId(12345678)).toBe(false);
  });
});
