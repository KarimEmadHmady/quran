import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { LruCache } from '../search/cache/lru-cache';
import { PrismaService } from '../prisma/prisma.service';
import { AlQuranCloudClient } from './alquran-cloud.client';
import { CACHE, ELIGIBLE, cdnUrl, isCdnUrlFor, parseCdnUrl } from './quran-audio.constants';
import {
  QuranNumberingService,
  type NumberedAyah,
  type NumberedSura,
} from './quran-numbering.service';
import { RecitersService, type ResolvedReciter } from './reciters.service';
import { isMissingAudioTable } from './schema-guard';

/**
 * Where a URL came from:
 *  - "synced":   ayah_audio row written by the audio sync (file existence verified);
 *  - "template": the reciter's verified CDN pattern (not synced yet; `fallbackUrls` lists the
 *                same recording at the other verified bitrates, tried by the player on error);
 *  - "api":      returned by AlQuran Cloud for this exact edition + ayah, checked field by field.
 */
export type AudioSource = 'synced' | 'template' | 'api';

export interface AudioTrack {
  ayahId: number;
  suraNumber: number;
  ayahNumber: number;
  globalNumber: number;
  /** null = no recording of this ayah exists for this reciter (the player skips it). */
  url: string | null;
  fallbackUrls: string[];
  bitrate: number | null;
  source: AudioSource | null;
}

export interface ReciterRef {
  identifier: string;
  name: string;
  englishName: string | null;
}

export interface SuraRef {
  number: number;
  nameAr: string;
  nameEn: string;
  ayahCount: number;
}

export interface AyahAudioResponse {
  reciter: ReciterRef;
  sura: SuraRef;
  track: AudioTrack;
}

export interface SuraAudioResponse {
  reciter: ReciterRef;
  sura: SuraRef;
  tracks: AudioTrack[];
  missing: number;
}

@Injectable()
export class AyahAudioService {
  private readonly logger = new Logger('QuranAudio');
  private readonly playlists = new LruCache<AudioTrack[]>(
    CACHE.playlistEntries,
    CACHE.playlistTtlMs,
  );
  private readonly liveAyahs = new LruCache<AudioTrack>(CACHE.liveAyahEntries, CACHE.liveAyahTtlMs);

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: AlQuranCloudClient,
    private readonly numbering: QuranNumberingService,
    private readonly reciters: RecitersService,
  ) {}

  clearCache(): void {
    this.playlists.clear();
    this.liveAyahs.clear();
  }

  async ayah(
    suraNumber: number,
    ayahNumber: number,
    reciterId: string,
  ): Promise<AyahAudioResponse> {
    const reciter = await this.reciters.resolve(reciterId);
    const { sura, ayah } = await this.numbering.ayah(suraNumber, ayahNumber);

    const cached = this.playlists.get(key(reciter, sura.number));
    let track = cached?.[ayahNumber - 1];
    if (!track) {
      const synced = await this.syncedTracks(reciter, [ayah]);
      track =
        synced.get(ayah.ayahId) ??
        (reciter.bitrate ? templateTrack(reciter, ayah) : await this.liveAyah(reciter, ayah));
    }
    if (!track.url)
      throw new NotFoundException('No recording of this ayah is available for this reciter');
    return { reciter: reciterRef(reciter), sura: suraRef(sura), track };
  }

  async sura(suraNumber: number, reciterId: string): Promise<SuraAudioResponse> {
    const reciter = await this.reciters.resolve(reciterId);
    const { sura, ayahs } = await this.numbering.sura(suraNumber);
    const k = key(reciter, sura.number);
    let tracks = this.playlists.get(k);
    if (!tracks) {
      tracks = await this.buildPlaylist(reciter, sura, ayahs);
      this.playlists.set(k, tracks);
    }
    return {
      reciter: reciterRef(reciter),
      sura: suraRef(sura),
      tracks,
      missing: tracks.filter((t) => !t.url).length,
    };
  }

  private async buildPlaylist(
    reciter: ResolvedReciter,
    sura: NumberedSura,
    ayahs: NumberedAyah[],
  ): Promise<AudioTrack[]> {
    const synced = await this.syncedTracks(reciter, ayahs);
    if (synced.size === ayahs.length) return ayahs.map((a) => synced.get(a.ayahId)!);
    if (reciter.bitrate) return ayahs.map((a) => synced.get(a.ayahId) ?? templateTrack(reciter, a));
    const live = await this.liveSura(reciter, sura, ayahs);
    return ayahs.map((a, i) => synced.get(a.ayahId) ?? live[i]);
  }

  /** Rows written by the audio sync (url re-checked against the ayah before use). */
  private async syncedTracks(
    reciter: ResolvedReciter,
    ayahs: NumberedAyah[],
  ): Promise<Map<number, AudioTrack>> {
    const out = new Map<number, AudioTrack>();
    if (reciter.dbId === null || ayahs.length === 0) return out;
    let rows: {
      ayahId: number;
      globalNumber: number;
      status: 'available' | 'missing';
      url: string | null;
      bitrate: number | null;
    }[];
    try {
      rows = await this.prisma.ayahAudio.findMany({
        where: { reciterId: reciter.dbId, ayahId: { in: ayahs.map((a) => a.ayahId) } },
        select: { ayahId: true, globalNumber: true, status: true, url: true, bitrate: true },
      });
    } catch (err) {
      if (isMissingAudioTable(err)) return out;
      throw err;
    }
    const byId = new Map(ayahs.map((a) => [a.ayahId, a]));
    for (const r of rows) {
      const a = byId.get(r.ayahId);
      if (!a || r.globalNumber !== a.globalNumber) continue; // stale / inconsistent row: ignored
      if (r.status === 'missing') {
        out.set(a.ayahId, {
          ...base(a),
          url: null,
          fallbackUrls: [],
          bitrate: null,
          source: 'synced',
        });
      } else if (isCdnUrlFor(r.url, reciter.identifier, a.globalNumber)) {
        out.set(a.ayahId, {
          ...base(a),
          url: r.url,
          fallbackUrls: [],
          bitrate: r.bitrate,
          source: 'synced',
        });
      }
    }
    return out;
  }

  /** One /surah/{n}/{edition} call; every ayah is checked before its URL is used. */
  private async liveSura(
    reciter: ResolvedReciter,
    sura: NumberedSura,
    ayahs: NumberedAyah[],
  ): Promise<AudioTrack[]> {
    let remote: Awaited<ReturnType<AlQuranCloudClient['surah']>>;
    try {
      remote = await this.client.surah(sura.number, reciter.identifier);
    } catch (err) {
      this.logger.warn(
        `live sura ${sura.number} (${reciter.identifier}) failed: ${err instanceof Error ? err.message : 'error'}`,
      );
      throw new ServiceUnavailableException('Audio is temporarily unavailable');
    }
    if (remote.edition !== reciter.identifier || remote.format !== ELIGIBLE.format) {
      throw new ServiceUnavailableException('Audio is temporarily unavailable');
    }
    return ayahs.map((a) => {
      const r = remote.ayahs[a.ayahNumber - 1];
      const ok =
        r &&
        r.numberInSurah === a.ayahNumber &&
        r.number === a.globalNumber &&
        isCdnUrlFor(r.audio, reciter.identifier, a.globalNumber);
      return ok
        ? {
            ...base(a),
            url: r.audio,
            fallbackUrls: fallbacksFrom(r.audioSecondary, reciter.identifier, a.globalNumber),
            bitrate: parseCdnUrl(r.audio)!.bitrate,
            source: 'api' as const,
          }
        : { ...base(a), url: null, fallbackUrls: [], bitrate: null, source: null };
    });
  }

  /** One /ayah/{s}:{a}/{edition} call, cached. */
  private async liveAyah(reciter: ResolvedReciter, a: NumberedAyah): Promise<AudioTrack> {
    const k = `${reciter.identifier}:${a.globalNumber}`;
    const hit = this.liveAyahs.get(k);
    if (hit) return hit;
    let r: Awaited<ReturnType<AlQuranCloudClient['ayah']>>;
    try {
      r = await this.client.ayah(a.suraNumber, a.ayahNumber, reciter.identifier);
    } catch {
      throw new ServiceUnavailableException('Audio is temporarily unavailable');
    }
    const ok =
      r.edition.identifier === reciter.identifier &&
      r.edition.format === ELIGIBLE.format &&
      r.surahNumber === a.suraNumber &&
      r.numberInSurah === a.ayahNumber &&
      r.number === a.globalNumber &&
      isCdnUrlFor(r.audio, reciter.identifier, a.globalNumber);
    const track: AudioTrack = ok
      ? {
          ...base(a),
          url: r.audio,
          fallbackUrls: fallbacksFrom(r.audioSecondary, reciter.identifier, a.globalNumber),
          bitrate: parseCdnUrl(r.audio)!.bitrate,
          source: 'api',
        }
      : { ...base(a), url: null, fallbackUrls: [], bitrate: null, source: null };
    this.liveAyahs.set(k, track);
    return track;
  }
}

const key = (r: ResolvedReciter, sura: number) => `${r.identifier}:${r.dbId ?? 'live'}:${sura}`;

const base = (a: NumberedAyah) => ({
  ayahId: a.ayahId,
  suraNumber: a.suraNumber,
  ayahNumber: a.ayahNumber,
  globalNumber: a.globalNumber,
});

function templateTrack(r: ResolvedReciter, a: NumberedAyah): AudioTrack {
  return {
    ...base(a),
    url: cdnUrl(r.bitrate!, r.identifier, a.globalNumber),
    fallbackUrls: r.secondaryBitrates.map((b) => cdnUrl(b, r.identifier, a.globalNumber)),
    bitrate: r.bitrate,
    source: 'template',
  };
}

const fallbacksFrom = (urls: string[], edition: string, global: number) =>
  urls.filter((u) => isCdnUrlFor(u, edition, global));

const reciterRef = (r: ResolvedReciter): ReciterRef => ({
  identifier: r.identifier,
  name: r.name,
  englishName: r.englishName,
});
const suraRef = (s: NumberedSura): SuraRef => ({
  number: s.number,
  nameAr: s.nameAr,
  nameEn: s.nameEn,
  ayahCount: s.ayahCount,
});
