import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { splitPassage } from './tafsir-passage';
import { HIDDEN_TAFSIR_BOOK_IDS } from './tafsir.constants';

const BOOK_PUBLIC_SELECT = {
  id: true,
  name: true,
  author: true,
} as const satisfies Prisma.TafsirBookSelect;

export type PublicTafsirBook = Prisma.TafsirBookGetPayload<{ select: typeof BOOK_PUBLIC_SELECT }>;

/**
 * Set when the stored text is shared, byte for byte, by consecutive ayahs (the book explains them
 * together; see tafsir-passage.ts). `split`: the boundaries are explicit, and `segment` is this
 * ayah's exact part of `content`. Otherwise the whole passage belongs to fromAyah–toAyah.
 */
export interface TafsirPassage {
  suraNumber: number;
  fromAyah: number;
  toAyah: number;
  split: boolean;
  segment: string | null;
}

export interface PublicTafsir {
  bookId: number;
  bookName: string;
  author: string | null;
  /** Always the full stored text, unchanged. */
  content: string;
  /** null = the text belongs to this ayah only. */
  passage: TafsirPassage | null;
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

  /** The only public endpoint that selects tafsirs.content (here and in passageOf, for the same request). */
  async forAyah(ayahId: number, bookIds?: number[]): Promise<PublicTafsir[]> {
    const ayah = await this.prisma.ayah.findUnique({
      where: { id: ayahId },
      select: { id: true, suraNumber: true, ayahNumber: true },
    });
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
    return Promise.all(
      rows.map(async (r) => {
        const content = r.content ?? ''; // rows are filtered to non-null; this only narrows the type
        return {
          bookId: r.bookId,
          bookName: r.book.name,
          author: r.book.author,
          content,
          passage: await this.passageOf(ayah, r.bookId, content),
        };
      }),
    );
  }

  /**
   * The consecutive ayahs of the same sura that store exactly this text in this book, and this
   * ayah's part when the text splits reliably. Reads only; the stored text is never changed.
   */
  private async passageOf(
    ayah: { id: number; suraNumber: number; ayahNumber: number },
    bookId: number,
    content: string,
  ): Promise<TafsirPassage | null> {
    if (content.length === 0) return null;
    // MySQL's _ci collation compares loosely (e.g. ignores harakat), so it only narrows the
    // candidates; equality is then checked exactly here.
    const candidates = await this.prisma.tafsir.findMany({
      where: { bookId, content: { equals: content }, ayah: { suraNumber: ayah.suraNumber } },
      select: { content: true, ayah: { select: { ayahNumber: true, textSimple: true } } },
    });
    const same = candidates
      .filter((c) => c.content === content)
      .map((c) => c.ayah)
      .sort((a, b) => a.ayahNumber - b.ayahNumber);
    // Only the unbroken run around this ayah (the same short text can recur elsewhere in a sura).
    const at = same.findIndex((a) => a.ayahNumber === ayah.ayahNumber);
    if (at === -1) return null;
    let from = at;
    let to = at;
    while (from > 0 && same[from - 1].ayahNumber === same[from].ayahNumber - 1) from--;
    while (to < same.length - 1 && same[to + 1].ayahNumber === same[to].ayahNumber + 1) to++;
    if (from === to) return null;

    const run = same.slice(from, to + 1);
    const base = {
      suraNumber: ayah.suraNumber,
      fromAyah: run[0].ayahNumber,
      toAyah: run[run.length - 1].ayahNumber,
    };
    const result = splitPassage(
      content,
      run.map((a) => ({ text: a.textSimple ?? '' })),
    );
    return result.ok
      ? { ...base, split: true, segment: result.parts[at - from] }
      : { ...base, split: false, segment: null };
  }
}
