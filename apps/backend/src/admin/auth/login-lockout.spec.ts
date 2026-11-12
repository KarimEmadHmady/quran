import {
  InMemoryLockoutStore,
  LOCKOUT_DURATION_MS,
  LOCKOUT_WINDOW_MS,
  LoginLockoutService,
} from './login-lockout';

function setup() {
  let now = 1_000_000;
  const clock = () => now;
  const store = new InMemoryLockoutStore(clock);
  const service = new LoginLockoutService(store, clock);
  return {
    store,
    service,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe('LoginLockoutService', () => {
  it('is not locked after 4 failures, locked after the 5th', async () => {
    const { service } = setup();
    for (let i = 0; i < 4; i++) await service.recordFailure('k');
    expect(await service.retryAfterSeconds('k')).toBeNull();
    await service.recordFailure('k');
    expect(await service.retryAfterSeconds('k')).toBe(900);
  });

  it('stays locked for 15 minutes, then unlocks', async () => {
    const { service, advance } = setup();
    for (let i = 0; i < 5; i++) await service.recordFailure('k');
    advance(LOCKOUT_DURATION_MS - 1500);
    expect(await service.retryAfterSeconds('k')).toBe(2);
    advance(1500);
    expect(await service.retryAfterSeconds('k')).toBeNull();
    // A fresh window starts: one failure does not re-lock.
    await service.recordFailure('k');
    expect(await service.retryAfterSeconds('k')).toBeNull();
  });

  it('only counts failures inside the 15-minute sliding window', async () => {
    const { service, advance } = setup();
    for (let i = 0; i < 4; i++) await service.recordFailure('k');
    advance(LOCKOUT_WINDOW_MS + 1);
    await service.recordFailure('k'); // the first 4 have expired
    expect(await service.retryAfterSeconds('k')).toBeNull();
  });

  it('keeps old failures that are still in the window', async () => {
    const { service, advance } = setup();
    for (let i = 0; i < 4; i++) {
      await service.recordFailure('k');
      advance(60_000);
    }
    await service.recordFailure('k');
    expect(await service.retryAfterSeconds('k')).not.toBeNull();
  });

  it('reset() clears failures; keys are independent', async () => {
    const { service } = setup();
    for (let i = 0; i < 4; i++) await service.recordFailure('a');
    await service.reset('a');
    await service.recordFailure('a');
    expect(await service.retryAfterSeconds('a')).toBeNull();
    for (let i = 0; i < 5; i++) await service.recordFailure('b');
    expect(await service.retryAfterSeconds('b')).not.toBeNull();
    expect(await service.retryAfterSeconds('a')).toBeNull();
  });
});

describe('InMemoryLockoutStore', () => {
  it('expires entries after their TTL', async () => {
    let now = 0;
    const store = new InMemoryLockoutStore(() => now);
    await store.set('k', { failures: [1], lockedUntil: null }, 1000);
    expect(await store.get('k')).toEqual({ failures: [1], lockedUntil: null });
    now = 1000;
    expect(await store.get('k')).toBeUndefined();
    expect(store.size).toBe(0);
  });

  it('is bounded: evicts the least recently written key when full', async () => {
    const store = new InMemoryLockoutStore(() => 0, 2);
    const e = { failures: [], lockedUntil: null };
    await store.set('a', e, 1000);
    await store.set('b', e, 1000);
    await store.set('a', e, 1000); // rewrite moves "a" to the end
    await store.set('c', e, 1000); // evicts "b"
    expect(store.size).toBe(2);
    expect(await store.get('b')).toBeUndefined();
    expect(await store.get('a')).toBeDefined();
    expect(await store.get('c')).toBeDefined();
  });

  it('delete() removes a key; defaults to the real clock', async () => {
    const store = new InMemoryLockoutStore();
    await store.set('k', { failures: [], lockedUntil: null }, 60_000);
    await store.delete('k');
    expect(await store.get('k')).toBeUndefined();
  });
});
