import { Controller, Get, Injectable, Query } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, Max, Min } from 'class-validator';
import { toIntList } from '../../common/validation/transforms';
import { PrismaService } from '../../prisma/prisma.service';
import { AYAH_PUBLIC_SELECT, type PublicAyah } from '../ayah.select';

/** Same cap as the cart / PDF export. */
export const MAX_AYAH_IDS = 100;

export class AyahsQueryDto {
  /** Comma-separated ayah ids, e.g. `ids=1,2,255`. */
  @Transform(toIntList)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_AYAH_IDS)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(4_294_967_295, { each: true }) // ayahs.id is INT UNSIGNED
  ids!: number[];
}

export type AyahWithSura = PublicAyah & { suraName: string };

@Injectable()
export class AyahsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Ayahs by id, in the order asked for; unknown ids are simply absent. Read-only. */
  async byIds(ids: readonly number[]): Promise<AyahWithSura[]> {
    const rows = await this.prisma.ayah.findMany({
      where: { id: { in: [...ids] } },
      select: { ...AYAH_PUBLIC_SELECT, sura: { select: { nameAr: true } } },
    });
    const byId = new Map(rows.map(({ sura, ...a }) => [a.id, { ...a, suraName: sura.nameAr }]));
    return ids.flatMap((id) => byId.get(id) ?? []);
  }
}

/**
 * GET /ayahs?ids= (used by the cart, spec 4.1: `quran_cart` stores only ayah ids).
 * Same public ayah shape as every other endpoint (claude.md 11.3), plus the sura name.
 */
@Controller('ayahs')
export class AyahsController {
  constructor(private readonly ayahs: AyahsService) {}

  @Get()
  async list(@Query() { ids }: AyahsQueryDto): Promise<{ data: AyahWithSura[] }> {
    return { data: await this.ayahs.byIds(ids) };
  }
}
