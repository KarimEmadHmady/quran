import {
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AlQuranCloudClient, isEligible } from './alquran-cloud.client';
import { AudioSyncService, type PublicJob } from './audio-sync.service';
import { AyahAudioService } from './ayah-audio.service';
import { RECITER_ID_PATTERN, TOTAL_AYAHS } from './quran-audio.constants';
import { QuranNumberingService } from './quran-numbering.service';
import { RecitersService, parseBitrates } from './reciters.service';
import { isMissingAudioTable, migrationRequired } from './schema-guard';
import { SurahRecitersService, type SurahReciterSyncResult } from './surah-reciters.service';

export interface AdminReciter {
  identifier: string;
  name: string;
  englishName: string | null;
  language: string;
  format: string;
  type: string;
  bitrate: number | null;
  secondaryBitrates: number[];
  isAvailable: boolean;
  isActive: boolean;
  verified: boolean;
  verifiedAt: string | null;
  verificationError: string | null;
  lastSyncedAt: string | null;
  audio: { available: number; missing: number };
}

export interface AudioOverview {
  /** false = the audio migration has not been applied yet. */
  schemaReady: boolean;
  reciters: { total: number; available: number; active: number; verified: number };
  ayahs: number;
  audio: { total: number; available: number; missing: number; expected: number };
  lastSyncAt: string | null;
  sync: {
    running: PublicJob | null;
    lastReciterJob: PublicJob | null;
    lastAudioJob: PublicJob | null;
  };
  reciterList: AdminReciter[];
}

export interface AdminEdition {
  identifier: string;
  name: string;
  englishName: string | null;
  language: string;
  format: string;
  type: string;
  /** Playable ayah by ayah in this app (Arabic, verse-by-verse, audio). */
  compatible: boolean;
}

@Injectable()
export class AudioAdminService {
  private readonly logger = new Logger('AdminQuranAudio');

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: AlQuranCloudClient,
    private readonly numbering: QuranNumberingService,
    private readonly reciters: RecitersService,
    private readonly audio: AyahAudioService,
    private readonly sync: AudioSyncService,
  ) {}

  async overview(): Promise<AudioOverview> {
    const ayahs = (await this.numbering.get()).ayahs.length;
    let rows;
    let counts;
    try {
      [rows, counts] = await Promise.all([
        this.prisma.audioReciter.findMany({
          orderBy: [{ isAvailable: 'desc' }, { identifier: 'asc' }],
        }),
        this.prisma.ayahAudio.groupBy({ by: ['reciterId', 'status'], _count: { _all: true } }),
      ]);
    } catch (err) {
      if (!isMissingAudioTable(err)) throw err;
      return {
        schemaReady: false,
        reciters: { total: 0, available: 0, active: 0, verified: 0 },
        ayahs,
        audio: { total: 0, available: 0, missing: 0, expected: 0 },
        lastSyncAt: null,
        sync: { running: null, lastReciterJob: null, lastAudioJob: null },
        reciterList: [],
      };
    }

    const per = new Map<number, { available: number; missing: number }>();
    for (const c of counts) {
      const e = per.get(c.reciterId) ?? { available: 0, missing: 0 };
      e[c.status] += c._count._all;
      per.set(c.reciterId, e);
    }
    const reciterList: AdminReciter[] = rows.map((r) => ({
      identifier: r.identifier,
      name: r.name,
      englishName: r.englishName,
      language: r.language,
      format: r.format,
      type: r.type,
      bitrate: r.bitrate,
      secondaryBitrates: parseBitrates(r.secondaryBitrates).filter((b) => b !== r.bitrate),
      isAvailable: r.isAvailable,
      isActive: r.isActive,
      verified: !!r.verifiedAt && !!r.bitrate,
      verifiedAt: r.verifiedAt?.toISOString() ?? null,
      verificationError: r.verificationError,
      lastSyncedAt: r.lastSyncedAt?.toISOString() ?? null,
      audio: per.get(r.id) ?? { available: 0, missing: 0 },
    }));
    const usable = reciterList.filter((r) => r.isAvailable && r.isActive && r.verified);
    const available = reciterList.reduce((n, r) => n + r.audio.available, 0);
    const missing = reciterList.reduce((n, r) => n + r.audio.missing, 0);
    const lastSync = rows
      .map((r) => r.lastSyncedAt?.getTime() ?? 0)
      .reduce((a, b) => Math.max(a, b), 0);

    return {
      schemaReady: true,
      reciters: {
        total: rows.length,
        available: reciterList.filter((r) => r.isAvailable).length,
        active: reciterList.filter((r) => r.isAvailable && r.isActive).length,
        verified: reciterList.filter((r) => r.verified).length,
      },
      ayahs,
      audio: {
        total: available + missing,
        available,
        missing,
        expected: usable.length * TOTAL_AYAHS,
      },
      lastSyncAt: lastSync ? new Date(lastSync).toISOString() : null,
      sync: await this.sync.status(),
      reciterList,
    };
  }

  /** Every audio edition AlQuran Cloud offers, with whether this app can play it ayah by ayah. */
  async editions(): Promise<{ data: AdminEdition[] }> {
    let list;
    try {
      list = await this.client.allAudioEditions();
    } catch {
      throw new ServiceUnavailableException('AlQuran Cloud is temporarily unavailable');
    }
    return {
      data: list
        .map((e) => ({ ...e, compatible: isEligible(e) }))
        .sort(
          (a, b) =>
            Number(b.compatible) - Number(a.compatible) || a.identifier.localeCompare(b.identifier),
        ),
    };
  }

  /** Offer / hide a reciter to users. Only `is_active` changes; synced audio is kept. */
  async setActive(adminId: number, identifier: string, isActive: boolean): Promise<AdminReciter> {
    if (!RECITER_ID_PATTERN.test(identifier)) throw new NotFoundException('Unknown reciter');
    try {
      const found = await this.prisma.audioReciter.findUnique({ where: { identifier } });
      if (!found) throw new NotFoundException('Unknown reciter');
      await this.prisma.audioReciter.update({ where: { identifier }, data: { isActive } });
    } catch (err) {
      if (isMissingAudioTable(err)) throw migrationRequired();
      throw err;
    }
    this.logger.log(
      `admin=${adminId} ${isActive ? 'activated' : 'deactivated'} reciter ${identifier}`,
    );
    this.reciters.invalidate();
    this.audio.clearCache();
    const o = await this.overview();
    return o.reciterList.find((r) => r.identifier === identifier)!;
  }
}

// ------------------------------------------------------------------ full-sura reciters (Mode B)

export interface AdminSurahReciter {
  identifier: string;
  apiIdentifier: string | null;
  name: string | null;
  englishName: string | null;
  bitrate: number;
  bitrates: number[];
  surahCount: number;
  missingSurahs: number[];
  isAvailable: boolean;
  isActive: boolean;
  lastSyncedAt: string | null;
}

export interface AdminSurahReciters {
  schemaReady: boolean;
  total: number;
  available: number;
  active: number;
  complete: number;
  lastSyncAt: string | null;
  data: AdminSurahReciter[];
}

@Injectable()
export class SurahAudioAdminService {
  private readonly logger = new Logger('AdminQuranAudioSurah');

  constructor(
    private readonly prisma: PrismaService,
    private readonly surahReciters: SurahRecitersService,
  ) {}

  async list(): Promise<AdminSurahReciters> {
    let rows;
    try {
      rows = await this.prisma.audioSurahReciter.findMany({
        orderBy: [{ isAvailable: 'desc' }, { identifier: 'asc' }],
      });
    } catch (err) {
      if (!isMissingAudioTable(err)) throw err;
      return {
        schemaReady: false,
        total: 0,
        available: 0,
        active: 0,
        complete: 0,
        lastSyncAt: null,
        data: [],
      };
    }
    const data: AdminSurahReciter[] = rows.map((r) => ({
      identifier: r.identifier,
      apiIdentifier: r.apiIdentifier,
      name: r.name,
      englishName: r.englishName,
      bitrate: r.bitrate,
      bitrates: parseBitrates(r.bitrates),
      surahCount: r.surahCount,
      missingSurahs: parseBitrates(r.missingSurahs),
      isAvailable: r.isAvailable,
      isActive: r.isActive,
      lastSyncedAt: r.lastSyncedAt?.toISOString() ?? null,
    }));
    const last = rows
      .map((r) => r.lastSyncedAt?.getTime() ?? 0)
      .reduce((a, b) => Math.max(a, b), 0);
    return {
      schemaReady: true,
      total: data.length,
      available: data.filter((r) => r.isAvailable).length,
      active: data.filter((r) => r.isAvailable && r.isActive).length,
      complete: data.filter((r) => r.isAvailable && r.surahCount === 114).length,
      lastSyncAt: last ? new Date(last).toISOString() : null,
      data,
    };
  }

  async sync(adminId: number): Promise<SurahReciterSyncResult> {
    try {
      const result = await this.surahReciters.sync();
      this.logger.log(`admin=${adminId} synced full-sura reciters (${result.total})`);
      return result;
    } catch (err) {
      if (err instanceof HttpException) throw err;
      this.logger.warn(
        `full-sura reciter sync failed: ${err instanceof Error ? err.message : 'error'}`,
      );
      throw new ServiceUnavailableException('The CDN listing is temporarily unavailable');
    }
  }

  async setActive(
    adminId: number,
    identifier: string,
    isActive: boolean,
  ): Promise<AdminSurahReciter> {
    try {
      const found = await this.prisma.audioSurahReciter.findUnique({ where: { identifier } });
      if (!found) throw new NotFoundException('Unknown reciter');
      await this.prisma.audioSurahReciter.update({ where: { identifier }, data: { isActive } });
    } catch (err) {
      if (isMissingAudioTable(err)) throw migrationRequired();
      throw err;
    }
    this.logger.log(
      `admin=${adminId} ${isActive ? 'activated' : 'deactivated'} full-sura reciter ${identifier}`,
    );
    this.surahReciters.invalidate();
    return (await this.list()).data.find((r) => r.identifier === identifier)!;
  }
}
