import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TOTAL_AYAHS } from './quran-audio.constants';

export interface NumberedAyah {
  /** ayahs.id (the existing primary key; never changed). */
  ayahId: number;
  suraNumber: number;
  ayahNumber: number;
  /** Position in the Mushaf, 1..6236 = the number the API / CDN use. */
  globalNumber: number;
}

export interface NumberedSura {
  number: number;
  nameAr: string;
  nameEn: string;
  ayahCount: number;
  /** Global number of the sura's first ayah. */
  firstGlobal: number;
}

export interface Numbering {
  suras: NumberedSura[];
  /** Index = globalNumber - 1. */
  ayahs: NumberedAyah[];
  /** True when every ayahs.id equals its global number (informational: never relied on). */
  idsMatchGlobal: boolean;
}

/**
 * Mapping layer between this database and the AlQuran Cloud numbering (read-only).
 *
 * The global ayah number is DERIVED from the existing sura -> ayah relationship (suras in order,
 * ayahs in order within each sura), not from ayahs.id. The mapping is only trusted when it is
 * complete and consistent: 114 suras, 6236 ayahs, each sura's ayah_count equals its rows and its
 * ayah numbers are exactly 1..ayah_count. Otherwise audio is disabled (503) rather than risk
 * pairing an ayah with the wrong recording.
 */
@Injectable()
export class QuranNumberingService {
  private readonly logger = new Logger('QuranNumbering');
  private cached: Promise<Numbering> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  get(): Promise<Numbering> {
    if (!this.cached) {
      this.cached = this.build().catch((err: unknown) => {
        this.cached = null; // retry on the next request
        throw err;
      });
    }
    return this.cached;
  }

  /** Forget the cached mapping (after an admin edit of sura names, etc.). */
  invalidate(): void {
    this.cached = null;
  }

  async ayah(
    suraNumber: number,
    ayahNumber: number,
  ): Promise<{ sura: NumberedSura; ayah: NumberedAyah }> {
    const n = await this.get();
    const sura = n.suras[suraNumber - 1];
    if (!sura) throw new NotFoundException(`Sura ${suraNumber} not found`);
    if (ayahNumber < 1 || ayahNumber > sura.ayahCount) {
      throw new NotFoundException(`Ayah ${suraNumber}:${ayahNumber} not found`);
    }
    return { sura, ayah: n.ayahs[sura.firstGlobal - 1 + ayahNumber - 1] };
  }

  async sura(suraNumber: number): Promise<{ sura: NumberedSura; ayahs: NumberedAyah[] }> {
    const n = await this.get();
    const sura = n.suras[suraNumber - 1];
    if (!sura) throw new NotFoundException(`Sura ${suraNumber} not found`);
    return {
      sura,
      ayahs: n.ayahs.slice(sura.firstGlobal - 1, sura.firstGlobal - 1 + sura.ayahCount),
    };
  }

  private async build(): Promise<Numbering> {
    const [suras, rows] = await Promise.all([
      this.prisma.sura.findMany({
        select: { number: true, nameAr: true, nameEn: true, ayahCount: true },
        orderBy: { number: 'asc' },
      }),
      this.prisma.ayah.findMany({
        select: { id: true, suraNumber: true, ayahNumber: true },
        orderBy: [{ suraNumber: 'asc' }, { ayahNumber: 'asc' }],
      }),
    ]);

    const fail = (why: string): never => {
      this.logger.error(`ayah numbering is inconsistent, audio disabled: ${why}`);
      throw new ServiceUnavailableException(
        'Audio is unavailable: ayah numbering could not be verified',
      );
    };

    if (suras.length !== 114) fail(`expected 114 suras, found ${suras.length}`);
    if (rows.length !== TOTAL_AYAHS) fail(`expected ${TOTAL_AYAHS} ayahs, found ${rows.length}`);

    const numberedSuras: NumberedSura[] = [];
    const ayahs: NumberedAyah[] = [];
    let idsMatchGlobal = true;
    let i = 0;
    for (const [idx, s] of suras.entries()) {
      if (s.number !== idx + 1)
        fail(`sura numbers are not 1..114 (found ${s.number} at ${idx + 1})`);
      numberedSuras.push({
        number: s.number,
        nameAr: s.nameAr,
        nameEn: s.nameEn,
        ayahCount: s.ayahCount,
        firstGlobal: i + 1,
      });
      for (let a = 1; a <= s.ayahCount; a++, i++) {
        const row = rows[i];
        if (!row || row.suraNumber !== s.number || row.ayahNumber !== a) {
          fail(`sura ${s.number}: expected ayah ${a} at position ${i + 1}`);
        }
        if (row.id !== i + 1) idsMatchGlobal = false;
        ayahs.push({ ayahId: row.id, suraNumber: s.number, ayahNumber: a, globalNumber: i + 1 });
      }
    }
    if (i !== TOTAL_AYAHS) fail(`sura ayah counts add up to ${i}, not ${TOTAL_AYAHS}`);
    if (!idsMatchGlobal)
      this.logger.warn('ayahs.id differs from the global number; using the derived global number');
    return { suras: numberedSuras, ayahs, idsMatchGlobal };
  }
}
