import { buildThrottlerOptions, throttleKey } from './throttler.config';

describe('throttler config', () => {
  it('builds the three named throttlers from env (seconds -> ms)', () => {
    const options = buildThrottlerOptions({
      THROTTLE_DEFAULT_LIMIT: 100,
      THROTTLE_DEFAULT_TTL_SECONDS: 60,
      THROTTLE_AUTH_LIMIT: 5,
      THROTTLE_AUTH_TTL_SECONDS: 60,
      THROTTLE_SEARCH_LIMIT: 30,
      THROTTLE_SEARCH_TTL_SECONDS: 30,
    });
    if (Array.isArray(options)) throw new Error('expected object options');
    expect(options.errorMessage).toBe('Too many requests, please try again later.');
    expect(options.throttlers.map(({ name, limit, ttl }) => ({ name, limit, ttl }))).toEqual([
      { name: 'default', limit: 100, ttl: 60_000 },
      { name: 'auth', limit: 5, ttl: 60_000 },
      { name: 'search', limit: 30, ttl: 30_000 },
    ]);
    expect(options.throttlers.every((t) => t.generateKey === throttleKey)).toBe(true);
  });

  it('keys counters by throttler name and client, not by route', () => {
    expect(throttleKey({}, '1.2.3.4', 'default')).toBe('default:1.2.3.4');
    expect(throttleKey({}, '1.2.3.4', 'auth')).toBe('auth:1.2.3.4');
  });
});
