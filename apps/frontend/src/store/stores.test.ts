// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '@/lib/localStore';

const read = (key: string): unknown => JSON.parse(localStorage.getItem(key) ?? 'null');

function mockDeviceTheme(dark: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: dark && q.includes('dark'),
    media: q,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

beforeEach(() => {
  localStorage.clear();
  vi.resetModules(); // fresh store instances per test
  mockDeviceTheme(false);
});

describe('useSettingsStore (quran_settings)', () => {
  it('writes nothing until a setting changes; theme follows the device meanwhile', async () => {
    const { useSettingsStore, resolvedTheme } = await import('./useSettingsStore');
    mockDeviceTheme(true);
    useSettingsStore.getState().hydrate();
    expect(useSettingsStore.getState().theme).toBeNull();
    expect(resolvedTheme(useSettingsStore.getState().theme)).toBe('dark');
    expect(localStorage.getItem(STORAGE_KEYS.settings)).toBeNull();
  });

  it('persists the exact spec shape on every change and survives a reload', async () => {
    const { useSettingsStore } = await import('./useSettingsStore');
    const s = useSettingsStore.getState();
    s.hydrate();
    s.setFontSize(28);
    expect(read(STORAGE_KEYS.settings)).toEqual({ fontSize: 28, theme: 'light', script: 'uthmani' });
    s.setTheme('dark');
    s.setScript('simple');
    s.setFontSize(99); // clamped
    expect(read(STORAGE_KEYS.settings)).toEqual({ fontSize: 32, theme: 'dark', script: 'simple' });

    vi.resetModules();
    const again = (await import('./useSettingsStore')).useSettingsStore;
    again.getState().hydrate();
    expect(again.getState()).toMatchObject({ fontSize: 32, theme: 'dark', script: 'simple' });
  });

  it('ignores an invalid stored value', async () => {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify({ fontSize: 99, theme: 'neon' }));
    const { useSettingsStore } = await import('./useSettingsStore');
    useSettingsStore.getState().hydrate();
    expect(useSettingsStore.getState()).toMatchObject({ fontSize: 22, theme: null, script: 'uthmani' });
  });
});

describe('useBookmarkStore (quran_bookmark)', () => {
  it('stores the exact shape and skips rewriting the same ayah', async () => {
    const { useBookmarkStore } = await import('./useBookmarkStore');
    const b = useBookmarkStore.getState();
    b.hydrate();
    const now = new Date('2026-11-16T10:00:00.000Z');
    b.save({ ayahId: 262, suraNumber: 2, ayahNumber: 255 }, now);
    expect(read(STORAGE_KEYS.bookmark)).toEqual({
      ayahId: 262,
      suraNumber: 2,
      ayahNumber: 255,
      updatedAt: '2026-11-16T10:00:00.000Z',
    });
    const spy = vi.spyOn(Storage.prototype, 'setItem');
    b.save({ ayahId: 262, suraNumber: 2, ayahNumber: 255 }, new Date());
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('useKhatmaStore (quran_khatma)', () => {
  it('starts a plan, marks reading without duplicates, and stays independent of the bookmark', async () => {
    const { useKhatmaStore } = await import('./useKhatmaStore');
    const k = useKhatmaStore.getState();
    k.hydrate('2026-11-01');
    k.start(30, '2026-11-01');
    k.markRead(208, '2026-11-01');
    expect(read(STORAGE_KEYS.khatma)).toEqual({
      startDate: '2026-11-01',
      durationDays: 30,
      dailyTargetAyahs: 208,
      lastAyahId: 208,
      completedDates: ['2026-11-01'],
    });
    const spy = vi.spyOn(Storage.prototype, 'setItem');
    useKhatmaStore.getState().markRead(100, '2026-11-01'); // already read
    useKhatmaStore.getState().markRead(208, '2026-11-01');
    expect(spy).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEYS.bookmark)).toBeNull();
  });

  it('hydrate() drops corrupt data and reset() removes the key', async () => {
    localStorage.setItem(STORAGE_KEYS.khatma, '{"startDate":"x"}');
    const { useKhatmaStore } = await import('./useKhatmaStore');
    useKhatmaStore.getState().hydrate('2026-11-01');
    expect(useKhatmaStore.getState().khatma).toBeNull();
    useKhatmaStore.getState().start(7, '2026-11-01');
    useKhatmaStore.getState().reset();
    expect(localStorage.getItem(STORAGE_KEYS.khatma)).toBeNull();
  });
});

describe('useCartStore (quran_cart)', () => {
  it('persists exactly { ayahId; tafsirBookId? }[] and filters corrupt entries', async () => {
    localStorage.setItem(STORAGE_KEYS.cart, JSON.stringify([{ ayahId: 1 }, { ayahId: 'x' }, { ayahId: 2, tafsirBookId: 1 }]));
    const { useCartStore } = await import('./useCartStore');
    await useCartStore.persist.rehydrate();
    expect(useCartStore.getState().items).toEqual([{ ayahId: 1 }, { ayahId: 2, tafsirBookId: 1 }]);
    useCartStore.getState().add(3);
    useCartStore.getState().add(3); // no duplicate
    useCartStore.getState().setTafsir(1, 1);
    useCartStore.getState().setTafsir(2, undefined);
    expect(read(STORAGE_KEYS.cart)).toEqual([{ ayahId: 1, tafsirBookId: 1 }, { ayahId: 2 }, { ayahId: 3 }]);
  });
});
