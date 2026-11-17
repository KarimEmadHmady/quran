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

/** What happens when an ayah finishes: stop, continue to the end of the sura, or through the Quran. */
export type PlaybackMode = 'single' | 'sura' | 'quran';

/** `quran_audio` (audio player preferences; added with the audio feature, not in spec §3). */
export interface AudioPrefs {
  /** AlQuran Cloud edition identifier, e.g. "ar.alafasy"; null = the server's default reciter. */
  reciter: string | null;
  /** Full-sura reciter (CDN folder, e.g. "ar.alafasy"; a different list); null = automatic. */
  surahReciter: string | null;
  /** 0..1 */
  volume: number;
  /** Times each ayah is played: 1 = once, up to MAX_REPEAT; 0 = repeat until stopped. */
  repeat: number;
  mode: PlaybackMode;
}

export const MAX_REPEAT = 10;
export const RECITER_ID = /^[a-z]{2,3}\.[a-z0-9][a-z0-9.-]{0,58}$/;
export const DEFAULT_AUDIO_PREFS: AudioPrefs = { reciter: null, surahReciter: null, volume: 1, repeat: 1, mode: 'sura' };
export const SURAH_RECITER_ID = /^[a-z]{2,3}\.[a-z0-9][a-z0-9.-]{0,76}$/;

export function parseAudioPrefs(v: unknown): AudioPrefs | null {
  if (!isObj(v)) return null;
  if (v.reciter !== null && (typeof v.reciter !== 'string' || !RECITER_ID.test(v.reciter))) return null;
  if (typeof v.volume !== 'number' || !Number.isFinite(v.volume) || v.volume < 0 || v.volume > 1) return null;
  if (!isInt(v.repeat, 0, MAX_REPEAT)) return null;
  if (v.mode !== 'single' && v.mode !== 'sura' && v.mode !== 'quran') return null;
  // Added later: older saved preferences have no surahReciter (treated as automatic).
  const surahReciter = v.surahReciter ?? null;
  if (surahReciter !== null && (typeof surahReciter !== 'string' || !SURAH_RECITER_ID.test(surahReciter))) return null;
  return { ...pick(v as unknown as AudioPrefs, ['reciter', 'volume', 'repeat', 'mode']), surahReciter };
}

/**
 * `quran_audio_session`: the last listening position, restored (always PAUSED) on the next visit.
 * Only playback metadata: no audio, no personal data.
 */
export interface AudioSessionSaved {
  /** "ayah" = one file per ayah (single or sequential); "surah" = one file for the whole sura. */
  kind: 'ayah' | 'surah';
  /** «تشغيل آية تلو الأخرى» run (stops at the end of the sura). */
  sequence: boolean;
  suraNumber: number;
  /** Ayah within the sura (kind = "ayah"); null for a full-sura file. */
  ayahNumber: number | null;
  /** The exact reciter of the saved recording (ayah edition or full-sura CDN folder). */
  reciter: string;
  /** Seconds into the file. */
  position: number;
  /** Seconds (0 = unknown); only to draw the progress bar before the file is loaded again. */
  duration: number;
  /** Whether it was playing when saved (restored paused anyway). */
  wasPlaying: boolean;
  /** Display only. */
  suraName: string;
  reciterName: string;
  updatedAt: string;
}

const MAX_AUDIO_SECONDS = 6 * 60 * 60;
const isSeconds = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= MAX_AUDIO_SECONDS;
const isShortText = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;

export function parseAudioSession(v: unknown): AudioSessionSaved | null {
  if (!isObj(v)) return null;
  if (v.kind !== 'ayah' && v.kind !== 'surah') return null;
  if (typeof v.sequence !== 'boolean' || typeof v.wasPlaying !== 'boolean') return null;
  if (!isInt(v.suraNumber, 1, 114)) return null;
  if (v.kind === 'ayah' ? !isInt(v.ayahNumber, 1, 286) : v.ayahNumber !== null) return null;
  if (typeof v.reciter !== 'string' || !SURAH_RECITER_ID.test(v.reciter)) return null;
  if (!isSeconds(v.position) || !isSeconds(v.duration)) return null;
  if (!isShortText(v.suraName, 80) || !isShortText(v.reciterName, 160)) return null;
  if (!isIsoDateTime(v.updatedAt)) return null;
  return pick(v as unknown as AudioSessionSaved, [
    'kind',
    'sequence',
    'suraNumber',
    'ayahNumber',
    'reciter',
    'position',
    'duration',
    'wasPlaying',
    'suraName',
    'reciterName',
    'updatedAt',
  ]);
}
