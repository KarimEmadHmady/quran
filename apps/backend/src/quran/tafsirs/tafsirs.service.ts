import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { HIDDEN_TAFSIR_BOOK_IDS } from './tafsir.constants';

const BOOK_PUBLIC_SELECT = {
  id: true,
  name: true,
  author: true,
} as const satisfies Prisma.TafsirBookSelect;

export type PublicTafsirBook = Prisma.TafsirBookGetPayload<{ select: typeof BOOK_PUBLIC_SELECT }>;

export interface PublicTafsir {
  bookId: number;
  bookName: string;
  author: string | null;
  content: string;
}

@Injectable()
export class TafsirsService {
  constructor(private readonly prisma: PrismaService) {}

  /** The book list never touches tafsirs.content. */
  listBooks(): Promise<PublicTafsirBook[]> {
    return this.prisma.tafsirBook.findMany({
      where: { id: { notIn: [...HIDDEN_TAFSIR_BOOK_IDS] } },
      select: BOOK_PUBLIC_SELECT,
      orderBy: { id: 'asc' },
    });
  }

  /** Ayah ids (of those asked) that have non-empty tafsir in a visible book. Never selects content. */
  async availableFor(ayahIds: readonly number[]): Promise<number[]> {
    const rows = await this.prisma.tafsir.findMany({
      where: {
        ayahId: { in: [...ayahIds] },
        content: { not: null },
        bookId: { notIn: [...HIDDEN_TAFSIR_BOOK_IDS] },
      },
      select: { ayahId: true },
      distinct: ['ayahId'],
    });
    const have = new Set(rows.map((r) => r.ayahId));
    return ayahIds.filter((id) => have.has(id));
  }

  /** The ONLY query in the API that selects tafsirs.content. */
  async forAyah(ayahId: number, bookIds?: number[]): Promise<PublicTafsir[]> {
    const ayah = await this.prisma.ayah.findUnique({ where: { id: ayahId }, select: { id: true } });
    if (!ayah) throw new NotFoundException(`Ayah ${ayahId} not found`);

    const rows = await this.prisma.tafsir.findMany({
      where: {
        ayahId,
        content: { not: null },
        bookId: { notIn: [...HIDDEN_TAFSIR_BOOK_IDS], ...(bookIds && { in: bookIds }) },
      },
      select: { bookId: true, content: true, book: { select: { name: true, author: true } } },
      orderBy: { bookId: 'asc' },
    });
    return rows.map((r) => ({
      bookId: r.bookId,
      bookName: r.book.name,
      author: r.book.author,
      content: r.content ?? '', // rows are filtered to non-null; this only narrows the type
    }));
  }
}
