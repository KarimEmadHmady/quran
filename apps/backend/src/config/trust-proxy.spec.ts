import { parseTrustProxy } from './trust-proxy';

describe('parseTrustProxy', () => {
  it.each([
    ['false', false],
    ['', false],
    ['  ', false],
    ['true', true],
    ['0', 0],
    ['1', 1],
    ['2', 2],
    ['loopback', 'loopback'],
    ['loopback, 10.0.0.0/8', 'loopback, 10.0.0.0/8'],
    ['127.0.0.1,::1', '127.0.0.1, ::1'],
    ['fd00::/8, uniquelocal, linklocal', 'fd00::/8, uniquelocal, linklocal'],
  ])('parses %p', (raw, expected) => {
    expect(parseTrustProxy(raw)).toEqual(expected);
  });

  it.each([['yes'], ['33'], ['10.0.0.0/8; rm -rf'], ['example.com'], [',']])(
    'rejects %p',
    (raw) => {
      expect(parseTrustProxy(raw)).toBeUndefined();
    },
  );
});
