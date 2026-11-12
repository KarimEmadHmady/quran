import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  buildPageMeta,
  toSkipTake,
  type PageMeta,
  type PaginationQueryDto,
} from '../../common/pagination/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { AYAH_PUBLIC_SELECT, type PublicAyah } from '../ayah.select';

export const SURA_PUBLIC_SELECT = {
  number: true,
  nameAr: true,
  nameEn: true,
  ayahCount: true,
  revelationPlace: true,
} as const satisfies Prisma.SuraSelect;

export type PublicSura = Prisma.SuraGetPayload<{ select: typeof SURA_PUBLIC_SELECT }>;

export interface SuraWithAyahs {
  sura: PublicSura;
  ayahs: PublicAyah[];
  pagination: PageMeta;
}

@Injectable()
export class SurasService {
  constructor(private readonly prisma: PrismaService) {}

  list(): Promise<PublicSura[]> {
    return this.prisma.sura.findMany({ select: SURA_PUBLIC_SELECT, orderBy: { number: 'asc' } });
  }

  async findOne(number: number, paging: PaginationQueryDto): Promise<SuraWithAyahs> {
    const sura = await this.prisma.sura.findUnique({
      where: { number },
      select: SURA_PUBLIC_SELECT,
    });
    if (!sura) throw new NotFoundException(`Sura ${number} not found`);

    const where = { suraNumber: number } satisfies Prisma.AyahWhereInput;
    const [ayahs, total] = await Promise.all([
      this.prisma.ayah.findMany({
        where,
        select: AYAH_PUBLIC_SELECT,
        orderBy: { ayahNumber: 'asc' },
        ...toSkipTake(paging),
      }),
      this.prisma.ayah.count({ where }),
    ]);
    return { sura, ayahs, pagination: buildPageMeta(paging, total) };
  }
}
