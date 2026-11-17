/**
 * The exact localStorage shapes of spec §3, with strict validators: anything stored that does
 * not match (old versions, manual edits, corruption) is treated as absent, never half-used.
 */

export type Theme = 'light' | 'dark';
export type Script = 'uthmani' | 'simple';

/** `quran_settings` */
export interface Settings {
  fontSize: number;
  theme: Theme;
  script: Script;
}

/** `quran_bookmark` (one bookmark, updated while reading). */
export interface Bookmark {
  ayahId: number;
  suraNumber: number;
  ayahNumber: number;
  updatedAt: string;
}

/** `quran_khatma` */
export interface Khatma {
  startDate: string;
  durationDays: number;
  dailyTargetAyahs: number;
  lastAyahId: number;
  completedDates: string[];
}

/** `quran_last_route` */
export interface LastRoute {
  path: string;
  scrollY: number;
  updatedAt: string;
}

export const FONT_SIZE_MIN = 16;
export const FONT_SIZE_MAX = 32;
export const FONT_SIZE_DEFAULT = 22;
export const TOTAL_AYAHS = 6236;
export const MAX_KHATMA_DAYS = 1000;

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const isIsoDateTime = (v: unknown): v is string =>
  typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));
/** "YYYY-MM-DD" that is a real calendar date. */
export const isLocalDate = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  new Date(`${v}T00:00:00Z`).toISOString().startsWith(v);
/** Keeps only the listed keys, so nothing extra is ever written back. */
const pick = <T extends object>(o: T, keys: (keyof T)[]): T =>
  Object.fromEntries(keys.map((k) => [k, o[k]])) as T;

export function parseSettings(v: unknown): Settings | null {
  if (!isObj(v)) return null;
  if (!isInt(v.fontSize, FONT_SIZE_MIN, FONT_SIZE_MAX)) return null;
  if (v.theme !== 'light' && v.theme !== 'dark') return null;
  if (v.script !== 'uthmani' && v.script !== 'simple') return null;
  return pick(v as unknown as Settings, ['fontSize', 'theme', 'script']);
}

export function parseBookmark(v: unknown): Bookmark | null {
  if (!isObj(v)) return null;
  if (!isInt(v.ayahId, 1, TOTAL_AYAHS)) return null;
  if (!isInt(v.suraNumber, 1, 114) || !isInt(v.ayahNumber, 1, 286)) return null;
  if (!isIsoDateTime(v.updatedAt)) return null;
  return pick(v as unknown as Bookmark, ['ayahId', 'suraNumber', 'ayahNumber', 'updatedAt']);
}

export function parseKhatma(v: unknown): Khatma | null {
  if (!isObj(v)) return null;
  if (!isLocalDate(v.startDate)) return null;
  if (!isInt(v.durationDays, 1, MAX_KHATMA_DAYS)) return null;
  if (!isInt(v.dailyTargetAyahs, 1, TOTAL_AYAHS)) return null;
  if (!isInt(v.lastAyahId, 0, TOTAL_AYAHS)) return null;
  if (!Array.isArray(v.completedDates) || !v.completedDates.every(isLocalDate)) return null;
  const k = pick(v as unknown as Khatma, [
    'startDate',
    'durationDays',
    'dailyTargetAyahs',
    'lastAyahId',
    'completedDates',
  ]);
  return { ...k, completedDates: [...new Set(k.completedDates)].sort() };
}

export function parseLastRoute(v: unknown): LastRoute | null {
  if (!isObj(v)) return null;
  if (typeof v.path !== 'string' || !isSafeInternalPath(v.path)) return null;
  if (typeof v.scrollY !== 'number' || !Number.isFinite(v.scrollY) || v.scrollY < 0) return null;
  if (!isIsoDateTime(v.updatedAt)) return null;
  return pick(v as unknown as LastRoute, ['path', 'scrollY', 'updatedAt']);
}

/** Only same-app paths ("/surah/2"), never "//evil.com" or "https://…" (open redirect). */
export function isSafeInternalPath(p: string): boolean {
  return p.length <= 500 && p.startsWith('/') && !p.startsWith('//') && !p.includes('\\');
}
