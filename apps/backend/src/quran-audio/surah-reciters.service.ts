import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { AudioSurahReciter } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AlQuranCloudClient, type RemoteEdition } from './alquran-cloud.client';
import { parseCdnListing } from './cdn-listing';
import {
  CACHE,
  DEFAULT_SURAH_RECITER,
  PREFERRED_SURAH_BITRATE,
  SURAH_RECITER_ID_PATTERN,
  parseSurahCdnUrl,
  surahCdnUrl,
} from './quran-audio.constants';
import { QuranNumberingService } from './quran-numbering.service';
import { isMissingAudioTable, migrationRequired } from './schema-guard';

/** A reciter with complete-sura recordings (one MP3 per sura). */
export interface PublicSurahReciter {
  /** CDN folder name, e.g. "ar.alafasy" (NOT the verse-by-verse edition of the same name). */
  identifier: string;
  name: string | null;
  englishName: string | null;
  bitrate: number;
  /** How many of the 114 suras have a recording. */
  surahCount: number;
}

export interface SurahRecitersList {
  data: PublicSurahReciter[];
  defaultReciter: string | null;
  source: 'database' | 'live';
}

export interface SurahFileResponse {
  reciter: { identifier: string; name: string | null; englishName: string | null };
  sura: { number: number; nameAr: string; nameEn: string; ayahCount: number };
  url: string;
  bitrate: number;
}

export interface SurahReciterSyncResult {
  total: number;
  added: number;
  updated: number;
  markedUnavailable: number;
  withoutName: number;
  incomplete: number;
}

/** One catalogue entry, built from the by-surah CDN listing (+ names from the API). */
interface CatalogEntry {
  identifier: string;
  apiIdentifier: string | null;
  name: string | null;
  englishName: string | null;
  language: string;
  bitrate: number;
  bitrates: number[];
  surahs: Set<number>;
}

/**
 * Full-sura audio (Mode B). The reciter catalogue is SEPARATE from the verse-by-verse one:
 *
 *  - which reciters exist, at which bitrates, and which suras each one has, comes ONLY from the
 *    CDN's by-surah listing (https://cdn.islamic.network/quran/info/by-surah/info.json);
 *  - names come from AlQuran Cloud's "surahbysurah" editions. Their identifiers do not always
 *    equal the CDN folder (e.g. edition "ar.alafasy-surah" -> folder "ar.alafasy"), so an
 *    edition is matched to a folder by its identifier or the same without "-surah"; URLs are
 *    always built from the folder, never from the edition id.
 *
 * Only Arabic ("ar.*") folders are offered. A URL is returned only for a sura the listing has.
 */
@Injectable()
export class SurahRecitersService {
  private readonly logger = new Logger('QuranAudioSurah');
  private dbCache: { at: number; rows: AudioSurahReciter[] } | null = null;
  private live: { at: number; list: CatalogEntry[] } | null = null;
  private liveLoading: Promise<CatalogEntry[]> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: AlQuranCloudClient,
    private readonly numbering: QuranNumberingService,
  ) {}

  // ------------------------------------------------------------------ public

  async list(): Promise<SurahRecitersList> {
    const rows = await this.dbRows();
    if (rows.length > 0) {
      const data = rows
        .filter((r) => r.isAvailable && r.isActive && r.surahCount > 0)
        .map(rowToPublic);
      return { data, defaultReciter: pickDefault(data), source: 'database' };
    }
    const data = (await this.liveCatalog()).map(entryToPublic);
    return { data, defaultReciter: pickDefault(data), source: 'live' };
  }

  /** The MP3 of one whole sura. 404 for an unknown reciter or a sura it has no recording of. */
  async file(surahNumber: number, identifier: string): Promise<SurahFileResponse> {
    const reciter = await this.resolve(identifier);
    const { sura } = await this.numbering.sura(surahNumber);
    if (!reciter.surahs.has(sura.number)) {
      throw new NotFoundException(
        'No full-sura recording of this sura is available for this reciter',
      );
    }
    const url = surahCdnUrl(reciter.bitrate, reciter.identifier, sura.number);
    const parsed = parseSurahCdnUrl(url);
    if (!parsed || parsed.folder !== reciter.identifier || parsed.surah !== sura.number) {
      throw new NotFoundException('Unknown reciter'); // never hand out a malformed URL
    }
    return {
      reciter: {
        identifier: reciter.identifier,
        name: reciter.name,
        englishName: reciter.englishName,
      },
      sura: {
        number: sura.number,
        nameAr: sura.nameAr,
        nameEn: sura.nameEn,
        ayahCount: sura.ayahCount,
      },
      url,
      bitrate: reciter.bitrate,
    };
  }

  invalidate(): void {
    this.dbCache = null;
  }

  // ------------------------------------------------------------------ sync (admin)

  /**
   * Rebuilds the catalogue from the CDN listing and upserts it (one row per CDN folder;
   * idempotent). Folders no longer listed are kept but marked unavailable. Synchronous: it is
   * two HTTP requests (~0.8 MB listing + the edition names).
   */
  async sync(): Promise<SurahReciterSyncResult> {
    const catalog = await this.buildCatalog();
    let existing: AudioSurahReciter[];
    try {
      existing = await this.prisma.audioSurahReciter.findMany();
    } catch (err) {
      if (isMissingAudioTable(err)) throw migrationRequired();
      throw err;
    }
    const byId = new Map(existing.map((r) => [r.identifier, r]));
    const now = new Date();
    const result: SurahReciterSyncResult = {
      total: catalog.length,
      added: 0,
      updated: 0,
      markedUnavailable: 0,
      withoutName: catalog.filter((e) => !e.name).length,
      incomplete: catalog.filter((e) => e.surahs.size < 114).length,
    };
    for (const e of catalog) {
      const data = {
        apiIdentifier: e.apiIdentifier,
        name: e.name,
        englishName: e.englishName,
        language: e.language,
        bitrate: e.bitrate,
        bitrates: e.bitrates.join(','),
        surahCount: e.surahs.size,
        missingSurahs: missingOf(e.surahs),
        isAvailable: true,
        lastSyncedAt: now,
      };
      await this.prisma.audioSurahReciter.upsert({
        where: { identifier: e.identifier },
        create: { identifier: e.identifier, ...data },
        update: data,
      });
      if (byId.has(e.identifier)) result.updated++;
      else result.added++;
    }
    const listed = new Set(catalog.map((e) => e.identifier));
    const gone = existing.filter((r) => r.isAvailable && !listed.has(r.identifier));
    if (gone.length > 0) {
      await this.prisma.audioSurahReciter.updateMany({
        where: { id: { in: gone.map((r) => r.id) } },
        data: { isAvailable: false },
      });
      result.markedUnavailable = gone.length;
    }
    this.invalidate();
    this.live = null;
    return result;
  }

  // ------------------------------------------------------------------ internals

  private async resolve(identifier: string): Promise<CatalogEntry> {
    if (!SURAH_RECITER_ID_PATTERN.test(identifier)) throw new NotFoundException('Unknown reciter');
    const rows = await this.dbRows();
    if (rows.length > 0) {
      const r = rows.find((x) => x.identifier === identifier);
      if (!r || !r.isAvailable || !r.isActive || r.surahCount === 0)
        throw new NotFoundException('Unknown reciter');
      return rowToEntry(r);
    }
    const e = (await this.liveCatalog()).find((x) => x.identifier === identifier);
    if (!e) throw new NotFoundException('Unknown reciter');
    return e;
  }

  async dbRows(): Promise<AudioSurahReciter[]> {
    if (this.dbCache && Date.now() - this.dbCache.at < 60_000) return this.dbCache.rows;
    try {
      const rows = await this.prisma.audioSurahReciter.findMany({ orderBy: { id: 'asc' } });
      this.dbCache = { at: Date.now(), rows };
      return rows;
    } catch (err) {
      if (isMissingAudioTable(err)) return [];
      if (this.dbCache) return this.dbCache.rows;
      throw err;
    }
  }

  /** Live catalogue (nothing synced yet), cached; a stale copy is served while the CDN is down. */
  private async liveCatalog(): Promise<CatalogEntry[]> {
    if (this.live && Date.now() - this.live.at < CACHE.liveSurahRecitersTtlMs)
      return this.live.list;
    if (!this.liveLoading) {
      this.liveLoading = this.buildCatalog()
        .then((list) => {
          this.live = { at: Date.now(), list };
          return list;
        })
        .finally(() => {
          this.liveLoading = null;
        });
    }
    try {
      return await this.liveLoading;
    } catch (err) {
      if (this.live) return this.live.list;
      this.logger.warn(
        `full-sura reciters unavailable: ${err instanceof Error ? err.message : 'error'}`,
      );
      throw new ServiceUnavailableException('Full-sura reciters are temporarily unavailable');
    }
  }

  private async buildCatalog(): Promise<CatalogEntry[]> {
    const listing = parseCdnListing(await this.client.surahCdnListing(), 'audio-surah');
    if (!listing) throw new Error('by-surah CDN listing has an unexpected format');

    // folder -> bitrate -> suras
    const folders = new Map<string, Map<number, Set<number>>>();
    for (const [key, files] of listing) {
      const [br, folder] = [
        Number(key.slice(0, key.indexOf('/'))),
        key.slice(key.indexOf('/') + 1),
      ];
      if (!folder.startsWith('ar.') || !SURAH_RECITER_ID_PATTERN.test(folder)) continue;
      const suras = new Set([...files].filter((n) => n >= 1 && n <= 114));
      if (suras.size === 0) continue;
      const m = folders.get(folder) ?? new Map<number, Set<number>>();
      m.set(br, suras);
      folders.set(folder, m);
    }

    // Names (optional: without them the catalogue still works, the UI shows the identifier).
    let editions: RemoteEdition[] = [];
    try {
      editions = await this.client.surahEditions();
    } catch {
      this.logger.warn('surahbysurah edition names unavailable; continuing without names');
    }
    const names = new Map<string, RemoteEdition>();
    for (const e of editions) {
      if (e.format !== 'audio' || e.type !== 'surahbysurah') continue;
      for (const folder of [e.identifier, e.identifier.replace(/-surah$/, '')]) {
        // An exact folder match wins over the "-surah" stripped one.
        if (folders.has(folder) && (!names.has(folder) || e.identifier === folder)) {
          names.set(folder, e);
          break;
        }
      }
    }

    const out: CatalogEntry[] = [];
    for (const [folder, byBitrate] of folders) {
      const bitrates = [...byBitrate.keys()].sort((a, b) => b - a);
      const bitrate = byBitrate.has(PREFERRED_SURAH_BITRATE)
        ? PREFERRED_SURAH_BITRATE
        : bitrates[0];
      const e = names.get(folder);
      const name = e && e.name !== e.identifier ? e.name : null;
      out.push({
        identifier: folder,
        apiIdentifier: e?.identifier ?? null,
        name,
        englishName: e?.englishName ?? null,
        language: 'ar',
        bitrate,
        bitrates,
        surahs: byBitrate.get(bitrate)!,
      });
    }
    return out.sort((a, b) => (a.name ?? a.identifier).localeCompare(b.name ?? b.identifier, 'ar'));
  }
}

function missingOf(surahs: Set<number>): string | null {
  const missing: number[] = [];
  for (let n = 1; n <= 114; n++) if (!surahs.has(n)) missing.push(n);
  return missing.length ? missing.join(',') : null;
}

function rowToEntry(r: AudioSurahReciter): CatalogEntry {
  const missing = new Set((r.missingSurahs ?? '').split(',').filter(Boolean).map(Number));
  const surahs = new Set<number>();
  for (let n = 1; n <= 114; n++) if (!missing.has(n)) surahs.add(n);
  return {
    identifier: r.identifier,
    apiIdentifier: r.apiIdentifier,
    name: r.name,
    englishName: r.englishName,
    language: r.language,
    bitrate: r.bitrate,
    bitrates: r.bitrates.split(',').map(Number).filter(Boolean),
    surahs,
  };
}

const rowToPublic = (r: AudioSurahReciter): PublicSurahReciter => ({
  identifier: r.identifier,
  name: r.name,
  englishName: r.englishName,
  bitrate: r.bitrate,
  surahCount: r.surahCount,
});

const entryToPublic = (e: CatalogEntry): PublicSurahReciter => ({
  identifier: e.identifier,
  name: e.name,
  englishName: e.englishName,
  bitrate: e.bitrate,
  surahCount: e.surahs.size,
});

function pickDefault(list: PublicSurahReciter[]): string | null {
  return (
    list.find((r) => r.identifier === DEFAULT_SURAH_RECITER)?.identifier ??
    list.find((r) => r.surahCount === 114)?.identifier ??
    list[0]?.identifier ??
    null
  );
}
