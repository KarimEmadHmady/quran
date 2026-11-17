/**
 * Quran audio (AlQuran Cloud) constants and URL rules.
 * Docs: https://alquran.cloud/api and https://alquran.cloud/cdn
 */

export const ALQURAN_API_BASE = 'https://api.alquran.cloud/v1';
export const AUDIO_CDN_BASE = 'https://cdn.islamic.network/quran/audio';
/** Directory listing of every MP3 on the CDN (per bitrate / edition). Undocumented: optional. */
export const AUDIO_CDN_LISTING_URL = 'https://cdn.islamic.network/quran/info/by-ayah/info.json';

/** Used when the user has not picked a reciter (only if it is synced / listed and active). */
export const DEFAULT_RECITER = 'ar.alafasy';

/** Only Arabic, verse-by-verse, audio editions can be played ayah by ayah. */
export const ELIGIBLE = { format: 'audio', language: 'ar', type: 'versebyverse' } as const;

export const TOTAL_AYAHS = 6236;

/** Edition identifiers, e.g. "ar.alafasy", "ar.husary-2". Anything else is rejected (400/404). */
export const RECITER_ID_PATTERN = /^[a-z]{2,3}\.[a-z0-9][a-z0-9.-]{0,58}$/;

/** The only audio URL shape ever stored or returned (https, official CDN host). */
const CDN_URL =
  /^https:\/\/cdn\.islamic\.network\/quran\/audio\/(\d{2,3})\/([a-z]{2,3}\.[a-z0-9][a-z0-9.-]{0,58})\/(\d{1,4})\.mp3$/;

export interface ParsedCdnUrl {
  bitrate: number;
  edition: string;
  globalNumber: number;
}

export function parseCdnUrl(url: unknown): ParsedCdnUrl | null {
  if (typeof url !== 'string') return null;
  const m = CDN_URL.exec(url);
  if (!m) return null;
  return { bitrate: Number(m[1]), edition: m[2], globalNumber: Number(m[3]) };
}

/** https://cdn.islamic.network/quran/audio/{bitrate}/{edition}/{ayahGlobalNumber}.mp3 */
export function cdnUrl(bitrate: number, edition: string, globalNumber: number): string {
  return `${AUDIO_CDN_BASE}/${bitrate}/${edition}/${globalNumber}.mp3`;
}

/** True only for a CDN URL of exactly this edition and global ayah number. */
export function isCdnUrlFor(url: unknown, edition: string, globalNumber: number): boolean {
  const p = parseCdnUrl(url);
  return !!p && p.edition === edition && p.globalNumber === globalNumber;
}

/** HTTP behaviour towards AlQuran Cloud (be a polite client). */
export const HTTP = {
  timeoutMs: 15_000,
  listingTimeoutMs: 90_000,
  /** Max bytes accepted for the CDN listing (it is ~18 MB). */
  listingMaxBytes: 64 * 1024 * 1024,
  /** Max bytes for a full edition (/quran/{edition}). */
  editionMaxBytes: 32 * 1024 * 1024,
  retries: 3,
  concurrency: 3,
  /** Minimum gap between two requests to the API. */
  minGapMs: 150,
} as const;

export const CACHE = {
  /** Live reciter list (used only while the DB has none). */
  liveRecitersTtlMs: 6 * 60 * 60 * 1000,
  /** Resolved sura playlists per reciter. */
  playlistEntries: 400,
  playlistTtlMs: 30 * 60 * 1000,
  /** Ayah URLs resolved live from the API (reciter without a verified template). */
  liveAyahEntries: 2000,
  liveAyahTtlMs: 6 * 60 * 60 * 1000,
  /** Full-sura reciter list built live from the CDN listing (used while the DB has none). */
  liveSurahRecitersTtlMs: 12 * 60 * 60 * 1000,
} as const;

/** Rows written per INSERT ... ON DUPLICATE KEY UPDATE during audio sync. */
export const SYNC_BATCH = 500;
/** Errors kept on a sync job (most recent). */
export const MAX_JOB_ERRORS = 50;

// ------------------------------------------------------------------ full-sura audio (one MP3 per sura)

export const SURAH_AUDIO_CDN_BASE = 'https://cdn.islamic.network/quran/audio-surah';
/** Directory listing of the per-sura MP3s. Defines which reciters / bitrates / suras exist. */
export const SURAH_CDN_LISTING_URL = 'https://cdn.islamic.network/quran/info/by-surah/info.json';

/** CDN folder names of full-sura reciters (also used as their identifier in this app). */
export const SURAH_RECITER_ID_PATTERN = /^[a-z]{2,3}\.[a-z0-9][a-z0-9.-]{0,76}$/;

/** Default full-sura reciter (when the user has not picked one and nothing better matches). */
export const DEFAULT_SURAH_RECITER = 'ar.alafasy';

/** Preferred bitrate for full-sura files when a reciter has several. */
export const PREFERRED_SURAH_BITRATE = 128;

/** Max bytes accepted for the by-surah listing (it is ~0.8 MB). */
export const SURAH_LISTING_MAX_BYTES = 16 * 1024 * 1024;

const SURAH_CDN_URL =
  /^https:\/\/cdn\.islamic\.network\/quran\/audio-surah\/(\d{2,3})\/([a-z]{2,3}\.[a-z0-9][a-z0-9.-]{0,76})\/(\d{1,3})\.mp3$/;

export interface ParsedSurahCdnUrl {
  bitrate: number;
  folder: string;
  surah: number;
}

export function parseSurahCdnUrl(url: unknown): ParsedSurahCdnUrl | null {
  if (typeof url !== 'string') return null;
  const m = SURAH_CDN_URL.exec(url);
  if (!m) return null;
  return { bitrate: Number(m[1]), folder: m[2], surah: Number(m[3]) };
}

/** https://cdn.islamic.network/quran/audio-surah/{bitrate}/{folder}/{surahNumber}.mp3 */
export function surahCdnUrl(bitrate: number, folder: string, surah: number): string {
  return `${SURAH_AUDIO_CDN_BASE}/${bitrate}/${folder}/${surah}.mp3`;
}
