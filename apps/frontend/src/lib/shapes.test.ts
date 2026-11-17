import { describe, expect, it } from 'vitest';
import {
  isLocalDate,
  isSafeInternalPath,
  parseBookmark,
  parseKhatma,
  parseLastRoute,
  parseSettings,
} from './shapes';

describe('spec §3 shapes', () => {
  it('quran_settings: exact shape, strict values, extra keys dropped', () => {
    expect(parseSettings({ fontSize: 22, theme: 'dark', script: 'simple', extra: 1 })).toEqual({
      fontSize: 22,
      theme: 'dark',
      script: 'simple',
    });
    for (const bad of [
      null,
      [],
      { fontSize: 15, theme: 'dark', script: 'uthmani' },
      { fontSize: 33, theme: 'dark', script: 'uthmani' },
      { fontSize: 22.5, theme: 'dark', script: 'uthmani' },
      { fontSize: 22, theme: 'system', script: 'uthmani' },
      { fontSize: 22, theme: 'dark', script: 'naskh' },
      { theme: 'dark', script: 'uthmani' },
    ]) {
      expect(parseSettings(bad)).toBeNull();
    }
  });

  it('quran_bookmark', () => {
    const b = { ayahId: 262, suraNumber: 2, ayahNumber: 255, updatedAt: '2026-11-16T10:00:00.000Z' };
    expect(parseBookmark({ ...b, x: 1 })).toEqual(b);
    expect(parseBookmark({ ...b, ayahId: 0 })).toBeNull();
    expect(parseBookmark({ ...b, ayahId: 6237 })).toBeNull();
    expect(parseBookmark({ ...b, suraNumber: 115 })).toBeNull();
    expect(parseBookmark({ ...b, updatedAt: 'yesterday' })).toBeNull();
  });

  it('quran_khatma: validates dates, dedupes and sorts completedDates', () => {
    const k = {
      startDate: '2026-11-01',
      durationDays: 30,
      dailyTargetAyahs: 208,
      lastAyahId: 500,
      completedDates: ['2026-11-02', '2026-11-01', '2026-11-02'],
    };
    expect(parseKhatma(k)).toEqual({ ...k, completedDates: ['2026-11-01', '2026-11-02'] });
    expect(parseKhatma({ ...k, startDate: '2026-02-30' })).toBeNull();
    expect(parseKhatma({ ...k, lastAyahId: -1 })).toBeNull();
    expect(parseKhatma({ ...k, durationDays: 0 })).toBeNull();
    expect(parseKhatma({ ...k, completedDates: ['2026-11-01', 'x'] })).toBeNull();
  });

  it('quran_last_route: only safe in-app paths', () => {
    const r = { path: '/surah/2', scrollY: 120, updatedAt: '2026-11-16T10:00:00.000Z' };
    expect(parseLastRoute(r)).toEqual(r);
    for (const path of ['//evil.com', 'https://evil.com', 'surah/2', '/\\evil']) {
      expect(parseLastRoute({ ...r, path })).toBeNull();
    }
    expect(parseLastRoute({ ...r, scrollY: -5 })).toBeNull();
    expect(isSafeInternalPath('/search?q=x')).toBe(true);
  });

  it('isLocalDate', () => {
    expect(isLocalDate('2028-02-29')).toBe(true);
    expect(isLocalDate('2026-02-29')).toBe(false);
    expect(isLocalDate('2026-1-01')).toBe(false);
  });
});
