import type { NextFunction, Request, Response } from 'express';
import { createUrlLengthGuard } from './url-length.middleware';

function run(url: string, max: number) {
  const req = { originalUrl: url, url, headers: {} } as unknown as Request;
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const res = { status } as unknown as Response;
  const next: NextFunction = jest.fn();
  createUrlLengthGuard(max)(req, res, next);
  return { status, json, next };
}

describe('createUrlLengthGuard', () => {
  it('passes URLs at or under the limit', () => {
    const { next, status } = run(`/s?q=${'a'.repeat(10)}`, 15);
    expect(next).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
  });

  it('rejects longer URLs with 414 in the shared error shape', () => {
    const { next, status, json } = run(`/s?q=${'a'.repeat(100)}`, 50);
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(414);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 414,
        error: 'URI Too Long',
        message: 'URL must be at most 50 characters',
        path: '/s',
      }),
    );
  });
});
