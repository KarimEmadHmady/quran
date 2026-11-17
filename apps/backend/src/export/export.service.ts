import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HIDDEN_TAFSIR_BOOK_IDS } from '../quran/tafsirs/tafsir.constants';
import type { ExportItemDto } from './dto/export-pdf.dto';
import { PdfRendererService } from './pdf-renderer.service';
import { renderExportHtml, type ExportDocument } from './pdf-template';

/** The Uthmani font, embedded in the HTML (copied to dist by nest-cli assets). */
export const FONT_PATH = join(__dirname, 'assets', 'fonts', 'AmiriQuran-Regular.ttf');

let fontDataUri: string | null = null;
function font(): string {
  fontDataUri ??= `data:font/ttf;base64,${readFileSync(FONT_PATH).toString('base64')}`;
  return fontDataUri;
}

/**
 * POST /export/pdf (spec 4.1): loads the cart's ayahs (+ tafsir when asked) READ-ONLY, builds
 * the HTML and renders it. Hidden / unconfirmed tafsir books (claude.md 11.6) are refused.
 */
@Injectable()
export class ExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly renderer: PdfRendererService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async pdf(items: readonly ExportItemDto[]): Promise<Buffer> {
    const html = renderExportHtml(await this.document(items), font());
    return this.renderer.render(html);
  }

  /** The document's data, in cart order (duplicates keep their first position). */
  async document(items: readonly ExportItemDto[]): Promise<ExportDocument> {
    const seen = new Set<number>();
    const unique = items.filter((i) => !seen.has(i.ayahId) && seen.add(i.ayahId));

    const bookIds = [
      ...new Set(unique.flatMap((i) => (i.tafsirBookId === undefined ? [] : [i.tafsirBookId]))),
    ];
    const hidden = bookIds.filter((id) => HIDDEN_TAFSIR_BOOK_IDS.includes(id));
    const books = bookIds.length
      ? await this.prisma.tafsirBook.findMany({
          where: { id: { in: bookIds, notIn: [...HIDDEN_TAFSIR_BOOK_IDS] } },
          select: { id: true, name: true },
        })
      : [];
    const unknown = bookIds.filter((id) => !hidden.includes(id) && !books.some((b) => b.id === id));
    if (hidden.length || unknown.length) {
      throw new BadRequestException(
        `Tafsir book(s) not available: ${[...hidden, ...unknown].sort((a, b) => a - b).join(', ')}`,
      );
    }

    const ayahs = await this.prisma.ayah.findMany({
      where: { id: { in: unique.map((i) => i.ayahId) } },
      select: {
        id: true,
        suraNumber: true,
        ayahNumber: true,
        textUthmani: true,
        sura: { select: { nameAr: true } },
      },
    });
    const byId = new Map(ayahs.map((a) => [a.id, a]));
    const missing = unique.filter((i) => !byId.has(i.ayahId)).map((i) => i.ayahId);
    if (missing.length) throw new NotFoundException(`Ayah(s) not found: ${missing.join(', ')}`);

    const pairs = unique.filter((i) => i.tafsirBookId !== undefined);
    const tafsirs = pairs.length
      ? await this.prisma.tafsir.findMany({
          where: { OR: pairs.map((i) => ({ ayahId: i.ayahId, bookId: i.tafsirBookId })) },
          select: { ayahId: true, bookId: true, content: true },
        })
      : [];
    const tafsirOf = (ayahId: number, bookId: number) =>
      tafsirs.find((t) => t.ayahId === ayahId && t.bookId === bookId)?.content ?? null;
    const bookName = new Map(books.map((b) => [b.id, b.name]));

    return {
      dateLabel: this.now().toLocaleDateString('ar-EG', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC',
      }),
      items: unique.map((i) => {
        const a = byId.get(i.ayahId)!;
        return {
          suraName: a.sura.nameAr,
          suraNumber: a.suraNumber,
          ayahNumber: a.ayahNumber,
          textUthmani: a.textUthmani,
          ...(i.tafsirBookId !== undefined && {
            tafsir: {
              bookName: bookName.get(i.tafsirBookId)!,
              content: tafsirOf(i.ayahId, i.tafsirBookId),
            },
          }),
        };
      }),
    };
  }
}
