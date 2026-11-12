import { parseDurationSeconds } from './duration';

describe('parseDurationSeconds', () => {
  it.each([
    ['90s', 90],
    ['15m', 900],
    ['8h', 28_800],
    ['7d', 604_800],
    [' 1h ', 3600],
  ])('parses %p', (raw, out) => {
    expect(parseDurationSeconds(raw, 60, 604_800)).toBe(out);
  });

  it.each(['', '0h', '8', 'h', '1.5h', '-1h', '8H', '1w', '8h30m', '1234567s'])(
    'rejects %p',
    (raw) => {
      expect(parseDurationSeconds(raw, 1, 10_000_000)).toBeUndefined();
    },
  );

  it('enforces the bounds', () => {
    expect(parseDurationSeconds('30s', 60, 3600)).toBeUndefined();
    expect(parseDurationSeconds('2h', 60, 3600)).toBeUndefined();
    expect(parseDurationSeconds('1h', 60, 3600)).toBe(3600);
  });
});
