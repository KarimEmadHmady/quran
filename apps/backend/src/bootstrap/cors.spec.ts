import { buildCorsOptions } from './cors';

type OriginFn = (
  origin: string | undefined,
  cb: (err: Error | null, allow?: boolean) => void,
) => void;

function allows(origin: string | undefined, allowed: string[]): boolean | undefined {
  const fn = buildCorsOptions(allowed).origin as OriginFn;
  let result: boolean | undefined;
  fn(origin, (err, allow) => {
    expect(err).toBeNull();
    result = allow;
  });
  return result;
}

describe('buildCorsOptions', () => {
  const allowed = ['http://localhost:3000', 'https://knjhjpd9-3000.eun1.devtunnels.ms'];

  it('allows exactly the configured origins', () => {
    expect(allows('http://localhost:3000', allowed)).toBe(true);
    expect(allows('https://knjhjpd9-3000.eun1.devtunnels.ms', allowed)).toBe(true);
    expect(allows('https://quran.example', allowed)).toBe(true);
  });

  it.each([
    ['https://evil.example'],
    ['http://localhost:3001'],
    ['https://quran.example.evil.com'],
    ['http://quran.example'],
    ['null'],
  ])('denies %p without throwing', (origin) => {
    expect(allows(origin, allowed)).toBe(false);
  });

  it('adds no CORS headers for requests without an Origin (same-origin / curl)', () => {
    expect(allows(undefined, allowed)).toBe(false);
  });

  it('allows credentials and exposes the request id and Retry-After', () => {
    const o = buildCorsOptions(allowed);
    expect(o.credentials).toBe(true);
    expect(o.exposedHeaders).toEqual(['X-Request-Id', 'Retry-After']);
  });
});
