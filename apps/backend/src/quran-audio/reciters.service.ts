import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { AudioReciter } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AlQuranCloudClient, UpstreamError, type RemoteEdition } from './alquran-cloud.client';
import {
  CACHE,
  DEFAULT_RECITER,
  ELIGIBLE,
  RECITER_ID_PATTERN,
  parseCdnUrl,
  type ParsedCdnUrl,
} from './quran-audio.constants';
import { QuranNumberingService, type Numbering } from './quran-numbering.service';
import { isMissingAudioTable } from './schema-guard';

export interface PublicReciter {
  identifier: string;
  name: string;
  englishName: string | null;
  language: string;
  format: string;
  type: string;
  /** Verified primary CDN bitrate (kbps); null = not verified yet (audio resolved through the API). */
  bitrate: number | null;
}

export interface RecitersList {
  data: PublicReciter[];
  defaultReciter: string | null;
  /** "database" = synchronized list; "live" = fetched from AlQuran Cloud (nothing synced yet). */
  source: 'database' | 'live';
}

/** A reciter ready for audio resolution. */
export interface ResolvedReciter extends PublicReciter {
  /** audio_reciters.id when synchronized (rows in ayah_audio may exist). */
  dbId: number | null;
  secondaryBitrates: number[];
}

export interface ReciterSyncResult {
  total: number;
  added: number;
  updated: number;
  markedUnavailable: number;
  verified: number;
  failed: { identifier: string; error: string }[];
}

export interface EditionVerification {
  bitrate: number;
  secondaryBitrates: number[];
}

/** Ayahs checked against the API for every edition: first, Ayat al-Kursi, last. */
const VERIFY_SAMPLES: [number, number][] = [
  [1, 1],
  [2, 255],
  [114, 6],
];

@Injectable()
export class RecitersService {
  private readonly logger = new Logger('QuranAudioReciters');
  private dbCache: { at: number; rows: AudioReciter[] } | null = null;
  private live: { at: number; list: RemoteEdition[] } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: AlQuranCloudClient,
    private readonly numbering: QuranNumberingService,
  ) {}

  // ------------------------------------------------------------------ public

  async list(): Promise<RecitersList> {
    const rows = await this.dbRows();
    if (rows.length > 0) {
      const data = rows.filter((r) => r.isAvailable && r.isActive).map(toPublic);
      return { data, defaultReciter: pickDefault(data), source: 'database' };
    }
    const data = (await this.liveEditions()).map((e): PublicReciter => ({ ...e, bitrate: null }));
    return { data, defaultReciter: pickDefault(data), source: 'live' };
  }

  /** The reciter, if listed and active; 404 otherwise (unknown ids never reach the API). */
  async resolve(identifier: string): Promise<ResolvedReciter> {
    if (!RECITER_ID_PATTERN.test(identifier)) throw new NotFoundException('Unknown reciter');
    const rows = await this.dbRows();
    if (rows.length > 0) {
      const r = rows.find((x) => x.identifier === identifier);
      if (!r || !r.isAvailable || !r.isActive) throw new NotFoundException('Unknown reciter');
      return {
        ...toPublic(r),
        dbId: r.id,
        secondaryBitrates: parseBitrates(r.secondaryBitrates).filter((b) => b !== r.bitrate),
      };
    }
    const e = (await this.liveEditions()).find((x) => x.identifier === identifier);
    if (!e) throw new NotFoundException('Unknown reciter');
    return { ...e, bitrate: null, dbId: null, secondaryBitrates: [] };
  }

  /** Forget cached rows (after a sync or an admin change). */
  invalidate(): void {
    this.dbCache = null;
  }

  // ------------------------------------------------------------------ sync (admin)

  /**
   * Fetches every Arabic verse-by-verse audio edition, upserts its metadata (idempotent: one
   * row per identifier) and verifies its CDN URL pattern. Editions no longer listed are kept
   * but marked unavailable (their synced audio rows stay, they are just not offered).
   */
  async sync(
    force: boolean,
    onProgress?: (done: number, total: number, current: string) => Promise<void>,
  ): Promise<ReciterSyncResult> {
    const editions = await this.client.eligibleEditions();
    if (editions.length === 0)
      throw new UpstreamError('AlQuran Cloud returned no eligible audio editions');
    const numbering = await this.numbering.get();
    const existing = new Map(
      (await this.prisma.audioReciter.findMany()).map((r) => [r.identifier, r]),
    );
    const result: ReciterSyncResult = {
      total: editions.length,
      added: 0,
      updated: 0,
      markedUnavailable: 0,
      verified: 0,
      failed: [],
    };
    const now = new Date();

    let done = 0;
    for (const e of editions) {
      await onProgress?.(done, editions.length, e.identifier);
      const prev = existing.get(e.identifier);
      const needsVerify = force || !prev || prev.bitrate === null || prev.verifiedAt === null;
      let verification: EditionVerification | null = null;
      let verificationError: string | null = prev?.verificationError ?? null;
      if (needsVerify) {
        try {
          verification = await this.verifyEdition(e.identifier, numbering);
          verificationError = null;
        } catch (err) {
          verificationError = (err instanceof Error ? err.message : 'verification failed').slice(
            0,
            250,
          );
          result.failed.push({ identifier: e.identifier, error: verificationError });
        }
      }
      const verifiedFields = needsVerify
        ? {
            bitrate: verification?.bitrate ?? null,
            secondaryBitrates: verification
              ? verification.secondaryBitrates.join(',') || null
              : null,
            verifiedAt: verification ? now : null,
            verificationError,
          }
        : {};
      const meta = {
        name: e.name,
        englishName: e.englishName,
        language: e.language,
        format: e.format,
        type: e.type,
        isAvailable: true,
        lastSyncedAt: now,
      };
      await this.prisma.audioReciter.upsert({
        where: { identifier: e.identifier },
        create: { identifier: e.identifier, ...meta, ...verifiedFields },
        update: { ...meta, ...verifiedFields },
      });
      if (prev) result.updated++;
      else result.added++;
      if (verification || (!needsVerify && prev?.bitrate)) result.verified++;
      done++;
    }

    const listed = new Set(editions.map((e) => e.identifier));
    const gone = [...existing.values()].filter((r) => !listed.has(r.identifier) && r.isAvailable);
    if (gone.length > 0) {
      await this.prisma.audioReciter.updateMany({
        where: { id: { in: gone.map((r) => r.id) } },
        data: { isAvailable: false },
      });
      result.markedUnavailable = gone.length;
    }
    await onProgress?.(done, editions.length, '');
    this.invalidate();
    this.live = null;
    return result;
  }

  /**
   * Proves that `{cdn}/{bitrate}/{edition}/{global}.mp3` is this edition's URL pattern:
   * for sample ayahs the API must echo the same audio edition, the same sura / ayah / global
   * number as OUR numbering, and a CDN URL with that edition and global number; the bitrate
   * must be the same for every sample; and the first sample's file must exist on the CDN.
   */
  async verifyEdition(identifier: string, numbering: Numbering): Promise<EditionVerification> {
    let bitrate: number | null = null;
    let secondary: number[] | undefined;
    let firstUrl = '';
    for (const [s, a] of VERIFY_SAMPLES) {
      const expected = numbering.ayahs[numbering.suras[s - 1].firstGlobal - 1 + a - 1].globalNumber;
      const r = await this.client.ayah(s, a, identifier);
      if (
        r.edition.identifier !== identifier ||
        r.edition.format !== ELIGIBLE.format ||
        r.edition.type !== ELIGIBLE.type
      ) {
        throw new Error(`API answered with another edition (${r.edition.identifier || 'none'})`);
      }
      if (r.surahNumber !== s || r.numberInSurah !== a || r.number !== expected) {
        throw new Error(
          `numbering mismatch at ${s}:${a} (API global ${r.number}, ours ${expected})`,
        );
      }
      const p = parseCdnUrl(r.audio);
      if (!p || p.edition !== identifier || p.globalNumber !== expected) {
        throw new Error(`audio URL for ${s}:${a} does not follow the CDN pattern`);
      }
      if (bitrate !== null && p.bitrate !== bitrate)
        throw new Error('inconsistent bitrate between ayahs');
      bitrate = p.bitrate;
      if (!firstUrl) firstUrl = r.audio!;
      const sec = new Set(
        r.audioSecondary
          .map(parseCdnUrl)
          .filter(
            (x): x is ParsedCdnUrl =>
              !!x && x.edition === identifier && x.globalNumber === expected,
          )
          .map((x) => x.bitrate),
      );
      secondary = secondary === undefined ? [...sec] : secondary.filter((b) => sec.has(b));
    }
    if (!(await this.client.headOk(firstUrl)))
      throw new Error('first recording is not available on the CDN');
    const primary = bitrate as number;
    const others: number[] = secondary ?? [];
    return {
      bitrate: primary,
      secondaryBitrates: others.filter((b) => b !== primary).sort((x, y) => y - x),
    };
  }

  // ------------------------------------------------------------------ internals

  /** All reciter rows (cached briefly). Missing tables = no rows (live fallback). */
  async dbRows(): Promise<AudioReciter[]> {
    if (this.dbCache && Date.now() - this.dbCache.at < 60_000) return this.dbCache.rows;
    try {
      const rows = await this.prisma.audioReciter.findMany({ orderBy: { id: 'asc' } });
      this.dbCache = { at: Date.now(), rows };
      return rows;
    } catch (err) {
      if (isMissingAudioTable(err)) return [];
      // DB hiccup: keep serving the last known list if there is one.
      if (this.dbCache) return this.dbCache.rows;
      throw err;
    }
  }

  private async liveEditions(): Promise<RemoteEdition[]> {
    if (this.live && Date.now() - this.live.at < CACHE.liveRecitersTtlMs) return this.live.list;
    try {
      const list = await this.client.eligibleEditions();
      this.live = { at: Date.now(), list };
      return list;
    } catch (err) {
      if (this.live) return this.live.list; // stale but usable while AlQuran Cloud is down
      this.logger.warn(`reciter list unavailable: ${err instanceof Error ? err.message : 'error'}`);
      throw new ServiceUnavailableException('Reciters are temporarily unavailable');
    }
  }
}

function toPublic(r: AudioReciter): PublicReciter {
  return {
    identifier: r.identifier,
    name: r.name,
    englishName: r.englishName,
    language: r.language,
    format: r.format,
    type: r.type,
    bitrate: r.verifiedAt ? r.bitrate : null,
  };
}

function pickDefault(list: PublicReciter[]): string | null {
  return (
    list.find((r) => r.identifier === DEFAULT_RECITER)?.identifier ?? list[0]?.identifier ?? null
  );
}

export function parseBitrates(v: string | null): number[] {
  return (v ?? '')
    .split(',')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0 && n < 1000);
}
