/**
 * Small LRU cache with a time-to-live (claude.md 5.11: "LRU on normalizedQuery+type, minutes").
 * Map iteration order is insertion order, so re-inserting on access keeps the least recently
 * used entry first.
 */
export class LruCache<V> {
  private readonly entries = new Map<string, { value: V; expires: number }>();
  private hitCount = 0;
  private missCount = 0;

  constructor(
    readonly maxEntries: number,
    readonly ttlMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {
    if (!Number.isInteger(maxEntries) || maxEntries < 1) {
      throw new RangeError(`maxEntries must be a positive integer, got ${maxEntries}`);
    }
    if (!(ttlMs > 0)) throw new RangeError(`ttlMs must be > 0, got ${ttlMs}`);
  }

  get(key: string): V | undefined {
    const e = this.entries.get(key);
    if (!e || e.expires <= this.now()) {
      if (e) this.entries.delete(key);
      this.missCount++;
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, e); // most recently used
    this.hitCount++;
    return e.value;
  }

  set(key: string, value: V): void {
    this.entries.delete(key);
    this.entries.set(key, { value, expires: this.now() + this.ttlMs });
    while (this.entries.size > this.maxEntries) {
      this.entries.delete(this.entries.keys().next().value as string);
    }
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }

  stats(): { size: number; hits: number; misses: number } {
    return { size: this.entries.size, hits: this.hitCount, misses: this.missCount };
  }
}
