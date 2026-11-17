import { LruCache } from './lru-cache';

describe('LruCache', () => {
  let now = 0;
  const clock = () => now;
  beforeEach(() => {
    now = 0;
  });

  it('stores, returns and counts hits/misses', () => {
    const c = new LruCache<number>(2, 1000, clock);
    expect(c.get('a')).toBeUndefined();
    c.set('a', 1);
    expect(c.get('a')).toBe(1);
    expect(c.stats()).toEqual({ size: 1, hits: 1, misses: 1 });
    expect(c.size).toBe(1);
  });

  it('evicts the least recently used entry', () => {
    const c = new LruCache<number>(2, 1000, clock);
    c.set('a', 1);
    c.set('b', 2);
    c.get('a'); // a is now the most recent
    c.set('c', 3); // evicts b
    expect(c.get('b')).toBeUndefined();
    expect(c.get('a')).toBe(1);
    expect(c.get('c')).toBe(3);
  });

  it('re-setting a key refreshes it instead of duplicating it', () => {
    const c = new LruCache<number>(2, 1000, clock);
    c.set('a', 1);
    c.set('a', 2);
    expect(c.size).toBe(1);
    expect(c.get('a')).toBe(2);
  });

  it('expires entries after the TTL', () => {
    const c = new LruCache<number>(5, 1000, clock);
    c.set('a', 1);
    now = 999;
    expect(c.get('a')).toBe(1);
    now = 1000;
    expect(c.get('a')).toBeUndefined();
    expect(c.size).toBe(0);
  });

  it('clear() empties it', () => {
    const c = new LruCache<number>(5, 1000, clock);
    c.set('a', 1);
    c.clear();
    expect(c.get('a')).toBeUndefined();
  });

  it('uses the real clock by default and validates its options', () => {
    const c = new LruCache<number>(1, 60_000);
    c.set('a', 1);
    expect(c.get('a')).toBe(1);
    expect(() => new LruCache(0, 1)).toThrow(RangeError);
    expect(() => new LruCache(1.5, 1)).toThrow(RangeError);
    expect(() => new LruCache(1, 0)).toThrow(RangeError);
  });
});
