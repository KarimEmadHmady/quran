/** Client for the backend's public Quran audio API (/quran-audio/*). */
import { API_URL, ApiRequestError, type ApiError } from './api';

export interface Reciter {
  identifier: string;
  name: string;
  englishName: string | null;
  language: string;
  format: string;
  type: string;
  bitrate: number | null;
}

export interface RecitersResponse {
  data: Reciter[];
  defaultReciter: string | null;
  source: 'database' | 'live';
}

export interface AudioTrack {
  ayahId: number;
  suraNumber: number;
  ayahNumber: number;
  globalNumber: number;
  /** null = no recording of this ayah for this reciter (skipped by the player). */
  url: string | null;
  /** Same recording at other verified bitrates, tried when `url` fails to load. */
  fallbackUrls: string[];
  bitrate: number | null;
  source: 'synced' | 'template' | 'api' | null;
}

export interface SuraAudio {
  reciter: { identifier: string; name: string; englishName: string | null };
  sura: { number: number; nameAr: string; nameEn: string; ayahCount: number };
  tracks: AudioTrack[];
  missing: number;
}

/** A reciter with ONE MP3 per sura (full-sura list; separate from the verse-by-verse list). */
export interface SurahReciter {
  identifier: string;
  name: string | null;
  englishName: string | null;
  bitrate: number;
  surahCount: number;
}

export interface SurahRecitersResponse {
  data: SurahReciter[];
  defaultReciter: string | null;
  source: 'database' | 'live';
}

export interface SurahFile {
  reciter: { identifier: string; name: string | null; englishName: string | null };
  sura: { number: number; nameAr: string; nameEn: string; ayahCount: number };
  url: string;
  bitrate: number;
}

async function get<T>(path: string, params: Record<string, string>, signal?: AbortSignal): Promise<T> {
  const url = new URL(API_URL + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  let res: Response;
  try {
    res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiRequestError(0, 'network');
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as Partial<ApiError> | null;
    throw new ApiRequestError(res.status, body?.message ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export const audioApi = {
  reciters: (signal?: AbortSignal) => get<RecitersResponse>('/quran-audio/reciters', {}, signal),
  sura: (suraNumber: number, reciter: string, signal?: AbortSignal) =>
    get<SuraAudio>(`/quran-audio/surah/${suraNumber}`, { reciter }, signal),
  fullSurahReciters: (signal?: AbortSignal) => get<SurahRecitersResponse>('/quran-audio/full-surah-reciters', {}, signal),
  /** URL of the ONE MP3 file of a whole sura (Mode B). */
  fullSurah: (suraNumber: number, reciter: string, signal?: AbortSignal) =>
    get<SurahFile>(`/quran-audio/full-surah/${suraNumber}`, { reciter }, signal),
};

/** Arabic message for a failed audio API call. */
export function audioErrorMessage(err: unknown): string {
  const status = err instanceof ApiRequestError ? err.status : 0;
  if (status === 0) return 'تعذّر الاتصال. تأكد من الإنترنت وحاول مرة أخرى.';
  if (status === 404) return 'القارئ أو الآية غير متاحين.';
  if (status === 429) return 'طلبات كثيرة. انتظر قليلاً ثم حاول مرة أخرى.';
  if (status === 503) return 'خدمة التلاوة غير متاحة مؤقتاً. حاول بعد قليل.';
  return 'تعذّر تحميل التلاوة.';
}
