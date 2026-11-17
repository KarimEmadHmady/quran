import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { SuraInfo } from '../query/sura-catalog';
import type { AlignableAyah } from './alignment-map';
import type { CorpusDoc } from './inverted-index';

/** An ayah as the search engine needs it: indexable (text_simple) and alignable (text_uthmani). */
export interface CorpusAyah extends CorpusDoc, AlignableAyah {}

/**
 * The ONLY ayah columns the search engine reads: text_simple for matching, text_uthmani for
 * the highlight alignment (claude.md 5.8). Besides `ayahs`, only `suras` is read (names for
 * reference search); never tafsirs, and never tafsirs.content (claude.md 4.3).
 */
export const CORPUS_AYAH_SELECT = {
  id: true,
  suraNumber: true,
  ayahNumber: true,
  textSimple: true,
  textUthmani: true,
} as const satisfies Prisma.AyahSelect;

/** Columns reference parsing reads from `suras` (S4): number, Arabic name, ayah count. */
export const CORPUS_SURA_SELECT = {
  number: true,
  nameAr: true,
  ayahCount: true,
} as const satisfies Prisma.SuraSelect;

@Injectable()
export class CorpusLoader {
  constructor(private readonly prisma: PrismaService) {}

  /** One read-only query; ayahs in id (mushaf) order. */
  async load(): Promise<CorpusAyah[]> {
    const rows = await this.prisma.ayah.findMany({
      select: CORPUS_AYAH_SELECT,
      orderBy: { id: 'asc' },
    });
    return rows.map((r) => ({
      ayahId: r.id,
      suraNumber: r.suraNumber,
      ayahNumber: r.ayahNumber,
      textSimple: r.textSimple ?? '', // nullable in the schema; 0 nulls in the data today
      textUthmani: r.textUthmani,
    }));
  }

  /** One read-only query on `suras` for reference search; in sura order. */
  async loadSuras(): Promise<SuraInfo[]> {
    return this.prisma.sura.findMany({ select: CORPUS_SURA_SELECT, orderBy: { number: 'asc' } });
  }
}
