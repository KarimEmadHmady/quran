import { Injectable, Logger } from '@nestjs/common';
import {
  ALQURAN_API_BASE,
  AUDIO_CDN_LISTING_URL,
  ELIGIBLE,
  HTTP,
  RECITER_ID_PATTERN,
  SURAH_CDN_LISTING_URL,
  SURAH_LISTING_MAX_BYTES,
} from './quran-audio.constants';

/** Upstream failure (network, timeout, 5xx, malformed body). Never exposes upstream details. */
export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/** An audio edition as returned by GET /edition. */
export interface RemoteEdition {
  identifier: string;
  name: string;
  englishName: string | null;
  language: string;
  format: string;
  type: string;
}

/** One ayah of an audio edition (GET /ayah, /surah, /quran). */
export interface RemoteAudioAyah {
  number: number;
  numberInSurah: number;
  surahNumber: number;
  audio: string | null;
  audioSecondary: string[];
}

export interface RemoteAyahResponse extends RemoteAudioAyah {
  edition: { identifier: string; format: string; type: string; language: string };
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max = 200): string | null =>
  typeof v === 'string' && v.length <= max ? v : null;
const int = (v: unknown): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Small HTTP client for api.alquran.cloud (and the CDN listing). Every response is validated
 * field by field; anything unexpected is an UpstreamError, never a half-trusted value.
 * Concurrency is capped and requests are spaced out; transient failures (network, timeout,
 * 429, 5xx) are retried with exponential backoff.
 */
@Injectable()
export class AlQuranCloudClient {
  private readonly logger = new Logger('AlQuranCloud');
  private active = 0;
  private readonly waiters: (() => void)[] = [];
  private lastStart = 0;

  // ------------------------------------------------------------------ editions

  /** GET /edition?format=audio&language=ar&type=versebyverse, filtered again locally. */
  async eligibleEditions(): Promise<RemoteEdition[]> {
    const data = await this.api('/edition', {
      format: ELIGIBLE.format,
      language: ELIGIBLE.language,
      type: ELIGIBLE.type,
    });
    return this.parseEditions(data).filter(isEligible);
  }

  /** GET /edition?format=audio — every audio edition (any language / type), for the admin view. */
  async allAudioEditions(): Promise<RemoteEdition[]> {
    return this.parseEditions(await this.api('/edition', { format: 'audio' }));
  }

  private parseEditions(data: unknown): RemoteEdition[] {
    if (!Array.isArray(data)) throw new UpstreamError('Unexpected /edition response');
    const out: RemoteEdition[] = [];
    const seen = new Set<string>();
    for (const e of data) {
      if (!isObj(e)) continue;
      const identifier = str(e.identifier, 64);
      const name = str(e.name, 150);
      const language = str(e.language, 10);
      const format = str(e.format, 20);
      const type = str(e.type, 30);
      if (
        !identifier ||
        !RECITER_ID_PATTERN.test(identifier) ||
        !name ||
        !language ||
        !format ||
        !type
      )
        continue;
      if (seen.has(identifier)) continue; // never two rows for one edition
      seen.add(identifier);
      out.push({
        identifier,
        name: name.trim(),
        englishName: str(e.englishName, 150)?.trim() || null,
        language,
        format,
        type,
      });
    }
    return out;
  }

  // ------------------------------------------------------------------ ayah / surah / quran

  /** GET /ayah/{surah}:{ayah}/{edition}. */
  async ayah(surah: number, ayah: number, edition: string): Promise<RemoteAyahResponse> {
    const data = await this.api(`/ayah/${surah}:${ayah}/${encodeURIComponent(edition)}`);
    if (!isObj(data) || !isObj(data.edition) || !isObj(data.surah))
      throw new UpstreamError('Unexpected /ayah response');
    const parsed = parseAudioAyah(data, int(data.surah.number));
    if (!parsed) throw new UpstreamError('Unexpected /ayah response');
    return {
      ...parsed,
      edition: {
        identifier: str(data.edition.identifier, 64) ?? '',
        format: str(data.edition.format, 20) ?? '',
        type: str(data.edition.type, 30) ?? '',
        language: str(data.edition.language, 10) ?? '',
      },
    };
  }

  /** GET /surah/{n}/{edition}: the ayahs of one sura, with the edition echoed back. */
  async surah(
    surah: number,
    edition: string,
  ): Promise<{ edition: string; format: string; ayahs: RemoteAudioAyah[] }> {
    const data = await this.api(`/surah/${surah}/${encodeURIComponent(edition)}`);
    if (
      !isObj(data) ||
      !isObj(data.edition) ||
      !Array.isArray(data.ayahs) ||
      int(data.number) !== surah
    ) {
      throw new UpstreamError('Unexpected /surah response');
    }
    const ayahs = data.ayahs.map((a) => (isObj(a) ? parseAudioAyah(a, surah) : null));
    if (ayahs.some((a) => a === null)) throw new UpstreamError('Unexpected /surah response');
    return {
      edition: str(data.edition.identifier, 64) ?? '',
      format: str(data.edition.format, 20) ?? '',
      ayahs: ayahs as RemoteAudioAyah[],
    };
  }

  /** GET /quran/{edition}: every ayah of an audio edition (one request, a few MB). */
  async quran(
    edition: string,
  ): Promise<{ edition: string; format: string; ayahs: RemoteAudioAyah[] }> {
    const data = await this.api(
      `/quran/${encodeURIComponent(edition)}`,
      {},
      HTTP.listingTimeoutMs,
      HTTP.editionMaxBytes,
    );
    if (!isObj(data) || !isObj(data.edition) || !Array.isArray(data.surahs))
      throw new UpstreamError('Unexpected /quran response');
    const ayahs: RemoteAudioAyah[] = [];
    for (const s of data.surahs) {
      if (!isObj(s) || !Array.isArray(s.ayahs))
        throw new UpstreamError('Unexpected /quran response');
      const surahNumber = int(s.number);
      for (const a of s.ayahs) {
        const parsed = isObj(a) ? parseAudioAyah(a, surahNumber) : null;
        if (!parsed) throw new UpstreamError('Unexpected /quran response');
        ayahs.push(parsed);
      }
    }
    return {
      edition: str(data.edition.identifier, 64) ?? '',
      format: str(data.edition.format, 20) ?? '',
      ayahs,
    };
  }

  /** The CDN directory listing as raw JSON (parsed defensively by cdn-listing.ts). */
  async cdnListing(): Promise<unknown> {
    return this.request(AUDIO_CDN_LISTING_URL, HTTP.listingTimeoutMs, HTTP.listingMaxBytes);
  }

  /** The by-surah CDN listing as raw JSON (parsed defensively by cdn-listing.ts). */
  async surahCdnListing(): Promise<unknown> {
    return this.request(SURAH_CDN_LISTING_URL, HTTP.listingTimeoutMs, SURAH_LISTING_MAX_BYTES);
  }

  /** GET /edition?format=audio&type=surahbysurah — full-sura editions (names only). */
  async surahEditions(): Promise<RemoteEdition[]> {
    return this.parseEditions(
      await this.api('/edition', { format: 'audio', type: 'surahbysurah' }),
    );
  }

  /** GET /surah/{n}/{edition}: only the sura-level `audio` URL of a surahbysurah edition. */
  async surahFileUrl(
    surah: number,
    edition: string,
  ): Promise<{ edition: string; audio: string | null }> {
    const data = await this.api(`/surah/${surah}/${encodeURIComponent(edition)}`);
    if (!isObj(data) || !isObj(data.edition) || int(data.number) !== surah) {
      throw new UpstreamError('Unexpected /surah response');
    }
    return {
      edition: str(data.edition.identifier, 80) ?? '',
      audio: typeof data.audio === 'string' && data.audio.length <= 255 ? data.audio : null,
    };
  }

  /** HEAD on a CDN file: true only for 200 + an audio content type. */
  async headOk(url: string): Promise<boolean> {
    return this.limited(async () => {
      for (let attempt = 0; attempt <= HTTP.retries; attempt++) {
        try {
          const res = await fetch(url, {
            method: 'HEAD',
            signal: AbortSignal.timeout(HTTP.timeoutMs),
            redirect: 'error',
          });
          if (res.status === 200)
            return (res.headers.get('content-type') ?? '').startsWith('audio/');
          if (res.status === 404 || res.status === 403) return false;
          if (!isTransient(res.status)) return false;
        } catch {
          // network / timeout: retry
        }
        await sleep(backoff(attempt));
      }
      throw new UpstreamError('CDN not reachable');
    });
  }

  // ------------------------------------------------------------------ plumbing

  /** Calls the API and returns `data` of a `{ code: 200, status: "OK", data }` envelope. */
  private async api(
    path: string,
    query: Record<string, string> = {},
    timeoutMs: number = HTTP.timeoutMs,
    maxBytes = 8 * 1024 * 1024,
  ): Promise<unknown> {
    const url = new URL(ALQURAN_API_BASE + path);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    const body = await this.request(url.toString(), timeoutMs, maxBytes);
    if (!isObj(body) || body.code !== 200 || !('data' in body)) {
      throw new UpstreamError(
        'Unexpected API envelope',
        isObj(body) && typeof body.code === 'number' ? body.code : undefined,
      );
    }
    return body.data;
  }

  private request(url: string, timeoutMs: number, maxBytes: number): Promise<unknown> {
    return this.limited(async () => {
      let lastError: UpstreamError = new UpstreamError('Upstream unavailable');
      for (let attempt = 0; attempt <= HTTP.retries; attempt++) {
        try {
          const res = await fetch(url, {
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(timeoutMs),
            redirect: 'follow',
          });
          if (!res.ok) {
            // The API answers 4xx for bad references / editions: not retried.
            const body = await res.json().catch(() => null);
            lastError = new UpstreamError(
              `HTTP ${res.status}`,
              isObj(body) && typeof body.code === 'number' ? body.code : res.status,
            );
            if (!isTransient(res.status)) throw lastError;
          } else {
            const len = Number(res.headers.get('content-length') ?? 0);
            if (len > maxBytes) throw new UpstreamError('Upstream response too large');
            const text = await res.text();
            if (text.length > maxBytes) throw new UpstreamError('Upstream response too large');
            try {
              return JSON.parse(text) as unknown;
            } catch {
              throw new UpstreamError('Upstream returned invalid JSON');
            }
          }
        } catch (err) {
          if (err instanceof UpstreamError && err.status !== undefined && !isTransient(err.status))
            throw err;
          if (err instanceof UpstreamError && /too large|invalid JSON/.test(err.message)) throw err;
          lastError =
            err instanceof UpstreamError ? err : new UpstreamError('Upstream unavailable');
        }
        if (attempt < HTTP.retries) await sleep(backoff(attempt));
      }
      this.logger.warn(`request failed after retries: ${redact(url)} (${lastError.message})`);
      throw lastError;
    });
  }

  /** Concurrency cap + minimum spacing between request starts. */
  private async limited<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= HTTP.concurrency) await new Promise<void>((r) => this.waiters.push(r));
    this.active++;
    try {
      const wait = this.lastStart + HTTP.minGapMs - Date.now();
      this.lastStart = Math.max(Date.now(), this.lastStart + HTTP.minGapMs);
      if (wait > 0) await sleep(wait);
      return await fn();
    } finally {
      this.active--;
      this.waiters.shift()?.();
    }
  }
}

export const isEligible = (e: RemoteEdition) =>
  e.format === ELIGIBLE.format && e.language === ELIGIBLE.language && e.type === ELIGIBLE.type;

function parseAudioAyah(
  a: Record<string, unknown>,
  surahNumber: number | null,
): RemoteAudioAyah | null {
  const number = int(a.number);
  const numberInSurah = int(a.numberInSurah);
  if (!number || !numberInSurah || !surahNumber) return null;
  const audio = typeof a.audio === 'string' && a.audio.length <= 255 ? a.audio : null;
  const audioSecondary = Array.isArray(a.audioSecondary)
    ? a.audioSecondary.filter((u): u is string => typeof u === 'string' && u.length <= 255)
    : [];
  return { number, numberInSurah, surahNumber, audio, audioSecondary };
}

const isTransient = (status: number) => status === 408 || status === 429 || status >= 500;
const backoff = (attempt: number) =>
  Math.min(8000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250);
const redact = (url: string) => url.split('?')[0];
