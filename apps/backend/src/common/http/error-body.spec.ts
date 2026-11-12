import { buildErrorBody, pathOnly, reasonPhrase } from './error-body';

const NOW = new Date('2026-01-01T00:00:00.000Z');

describe('error-body', () => {
  it('pathOnly strips the query string', () => {
    expect(pathOnly('/a/b?token=secret&x=1')).toBe('/a/b');
    expect(pathOnly('/a/b')).toBe('/a/b');
  });

  it('reasonPhrase maps known and unknown codes', () => {
    expect(reasonPhrase(404)).toBe('Not Found');
    expect(reasonPhrase(429)).toBe('Too Many Requests');
    expect(reasonPhrase(599)).toBe('Error');
  });

  it('builds the shared shape with request id and no query string', () => {
    const body = buildErrorBody({
      status: 404,
      message: 'Not here',
      req: { originalUrl: '/x?q=secret', url: '/x', headers: { 'x-request-id': 'abcdef12-3456' } },
      now: NOW,
    });
    expect(body).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: 'Not here',
      requestId: 'abcdef12-3456',
      path: '/x',
      timestamp: '2026-01-01T00:00:00.000Z',
    });
    expect(JSON.stringify(body)).not.toContain('secret');
  });

  it('includes details only when non-empty and omits a missing request id', () => {
    const req = { originalUrl: '/x', url: '/x', headers: {} };
    expect(buildErrorBody({ status: 400, message: 'm', details: [], req })).not.toHaveProperty(
      'details',
    );
    expect(buildErrorBody({ status: 400, message: 'm', details: ['a'], req }).details).toEqual([
      'a',
    ]);
    expect(buildErrorBody({ status: 400, message: 'm', req })).not.toHaveProperty('requestId');
  });
});
