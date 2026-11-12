import { Inject, Injectable } from '@nestjs/common';

export const LOCKOUT_MAX_FAILURES = 5;
export const LOCKOUT_WINDOW_MS = 15 * 60_000;
export const LOCKOUT_DURATION_MS = 15 * 60_000;

export interface LockoutEntry {
  /** Timestamps (ms) of recent failures inside the window. */
  failures: number[];
  /** While set and in the future, every login for this key gets 429. */
  lockedUntil: number | null;
}

/**
 * Storage for per-email login failures. In-memory today; a Redis implementation (GET/SET PX/DEL,
 * or an atomic Lua script) can replace it without touching the service.
 */
export interface LockoutStore {
  get(key: string): Promise<LockoutEntry | undefined>;
  set(key: string, entry: LockoutEntry, ttlMs: number): Promise<void>;
  delete(key: string): Promise<void>;
}

export const LOCKOUT_STORE = Symbol('LOCKOUT_STORE');
export const CLOCK = Symbol('CLOCK');
export type Clock = () => number;

/**
 * Single-process store with TTL. Bounded: when full, the oldest key is evicted, so a flood of
 * random emails cannot grow memory without limit.
 */
export class InMemoryLockoutStore implements LockoutStore {
  private readonly entries = new Map<string, { entry: LockoutEntry; expiresAt: number }>();

  constructor(
    private readonly now: Clock = Date.now,
    private readonly maxEntries = 10_000,
  ) {}

  get size(): number {
    return this.entries.size;
  }

  get(key: string): Promise<LockoutEntry | undefined> {
    const item = this.entries.get(key);
    if (item && item.expiresAt <= this.now()) this.entries.delete(key);
    return Promise.resolve(item && item.expiresAt > this.now() ? item.entry : undefined);
  }

  set(key: string, entry: LockoutEntry, ttlMs: number): Promise<void> {
    this.entries.delete(key); // re-insert so Map order stays "least recently written first"
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, { entry, expiresAt: this.now() + ttlMs });
    return Promise.resolve();
  }

  delete(key: string): Promise<void> {
    this.entries.delete(key);
    return Promise.resolve();
  }
}

@Injectable()
export class LoginLockoutService {
  constructor(
    @Inject(LOCKOUT_STORE) private readonly store: LockoutStore,
    @Inject(CLOCK) private readonly now: Clock,
  ) {}

  /** Seconds until the lock ends, or null when not locked. */
  async retryAfterSeconds(key: string): Promise<number | null> {
    const entry = await this.store.get(key);
    const now = this.now();
    if (!entry?.lockedUntil || entry.lockedUntil <= now) return null;
    return Math.max(1, Math.ceil((entry.lockedUntil - now) / 1000));
  }

  /** Records a failed attempt; the 5th failure inside 15 minutes locks the key for 15 minutes. */
  async recordFailure(key: string): Promise<void> {
    const now = this.now();
    const entry = await this.store.get(key);
    const failures = (entry?.failures ?? []).filter((t) => t > now - LOCKOUT_WINDOW_MS);
    failures.push(now);
    if (failures.length >= LOCKOUT_MAX_FAILURES) {
      await this.store.set(
        key,
        { failures: [], lockedUntil: now + LOCKOUT_DURATION_MS },
        LOCKOUT_DURATION_MS,
      );
      return;
    }
    await this.store.set(key, { failures, lockedUntil: null }, LOCKOUT_WINDOW_MS);
  }

  async reset(key: string): Promise<void> {
    await this.store.delete(key);
  }
}
