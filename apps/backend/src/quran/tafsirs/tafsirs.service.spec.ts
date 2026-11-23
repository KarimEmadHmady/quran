import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import { HIDDEN_TAFSIR_BOOK_IDS } from './tafsir.constants';
import { TafsirsService } from './tafsirs.service';

const AYAH_SELECT = { id: true, suraNumber: true, ayahNumber: true };

function setup() {
  const prisma = {
    tafsirBook: { findMany: jest.fn().mockResolvedValue([{ id: 1, name: 'n', author: 'a' }]) },
    ayah: { findUnique: jest.fn().mockResolvedValue({ id: 1, suraNumber: 2, ayahNumber: 5 }) },
    tafsir: {
      findMany: jest
        .fn()
        // 1st call: the ayah's rows; 2nd call (per row): ayahs of the sura storing the same text.
        .mockResolvedValueOnce([{ bookId: 1, content: 'c', book: { name: 'n', author: null } }])
        .mockResolvedValue([{ content: 'c', ayah: { ayahNumber: 5, textSimple: 's' } }]),
    },
  };
  return { prisma, service: new TafsirsService(prisma as unknown as PrismaService) };
}

/** Mocks a passage: the same `content` stored on these consecutive ayahs of sura 2. */
function withPassage(content: string, ayahs: { ayahNumber: number; text: string }[], self = 5) {
  const s = setup();
  s.prisma.ayah.findUnique.mockResolvedValue({ id: 99, suraNumber: 2, ayahNumber: self });
  s.prisma.tafsir.findMany
    .mockReset()
    .mockResolvedValueOnce([{ bookId: 1, content, book: { name: 'n', author: null } }])
    .mockResolvedValue(
      ayahs.map((a) => ({ content, ayah: { ayahNumber: a.ayahNumber, textSimple: a.text } })),
    );
  return s;
}

describe('TafsirsService', () => {
  it('placeholder ids are exactly 0, 2, 3, 4', () => {
    expect(HIDDEN_TAFSIR_BOOK_IDS).toEqual([0, 2, 3, 4]);
  });

  it('listBooks() filters placeholder books and never selects content', async () => {
    const { prisma, service } = setup();
    await expect(service.listBooks()).resolves.toEqual([{ id: 1, name: 'n', author: 'a' }]);
    expect(prisma.tafsirBook.findMany).toHaveBeenCalledWith({
      where: { id: { notIn: [0, 2, 3, 4] } },
      select: { id: true, name: true, author: true },
      orderBy: { id: 'asc' },
    });
  });

  it('forAyah() returns content for visible books only, skipping null content', async () => {
    const { prisma, service } = setup();
    await expect(service.forAyah(1)).resolves.toEqual([
      { bookId: 1, bookName: 'n', author: null, content: 'c', passage: null },
    ]);
    expect(prisma.ayah.findUnique).toHaveBeenCalledWith({ where: { id: 1 }, select: AYAH_SELECT });
    expect(prisma.tafsir.findMany).toHaveBeenNthCalledWith(1, {
      where: { ayahId: 1, content: { not: null }, bookId: { notIn: [0, 2, 3, 4] } },
      select: { bookId: true, content: true, book: { select: { name: true, author: true } } },
      orderBy: { bookId: 'asc' },
    });
  });

  it('forAyah() narrows to requested book_ids but still excludes placeholders', async () => {
    const { prisma, service } = setup();
    await service.forAyah(7, [1, 2]);
    expect(prisma.tafsir.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { ayahId: 7, content: { not: null }, bookId: { notIn: [0, 2, 3, 4], in: [1, 2] } },
      }),
    );
  });

  it('forAyah() maps a null content defensively to an empty string', async () => {
    const { prisma, service } = setup();
    prisma.tafsir.findMany
      .mockReset()
      .mockResolvedValue([{ bookId: 1, content: null, book: { name: 'n', author: 'a' } }]);
    await expect(service.forAyah(1)).resolves.toEqual([
      { bookId: 1, bookName: 'n', author: 'a', content: '', passage: null },
    ]);
  });

  it('forAyah() looks for the same text in the same sura and book, read-only', async () => {
    const { prisma, service } = setup();
    await service.forAyah(1);
    expect(prisma.tafsir.findMany).toHaveBeenNthCalledWith(2, {
      where: { bookId: 1, content: { equals: 'c' }, ayah: { suraNumber: 2 } },
      select: { content: true, ayah: { select: { ayahNumber: true, textSimple: true } } },
    });
  });

  const SPLITTABLE = 'قوله تعالى {إن الذين آمنوا} أ. قوله تعالى {جزاؤهم عند ربهم} ب.';
  const AYAHS = [
    { ayahNumber: 5, text: 'إن الذين آمنوا وعملوا الصالحات' },
    { ayahNumber: 6, text: 'جزاؤهم عند ربهم جنات عدن' },
  ];

  it("forAyah() returns this ayah's exact part of a reliably split passage, and the full text unchanged", async () => {
    const { service } = withPassage(SPLITTABLE, AYAHS, 6);
    const [t] = await service.forAyah(99);
    expect(t.content).toBe(SPLITTABLE);
    expect(t.passage).toEqual({
      suraNumber: 2,
      fromAyah: 5,
      toAyah: 6,
      split: true,
      segment: 'قوله تعالى {جزاؤهم عند ربهم} ب.',
    });
  });

  it('forAyah() marks an unsplittable passage with its range and no segment', async () => {
    const whole = 'قوله تعالى {إن الذين آمنوا} شرح يشمل {جزاؤهم عند ربهم} أيضا.';
    const { service } = withPassage(whole, AYAHS, 5);
    const [t] = await service.forAyah(99);
    expect(t.content).toBe(whole);
    expect(t.passage).toEqual({
      suraNumber: 2,
      fromAyah: 5,
      toAyah: 6,
      split: false,
      segment: null,
    });
  });

  it('forAyah() ignores loose (collation) matches whose text is not byte-identical', async () => {
    const { prisma, service } = withPassage(SPLITTABLE, AYAHS, 5);
    prisma.tafsir.findMany
      .mockReset()
      .mockResolvedValueOnce([
        { bookId: 1, content: SPLITTABLE, book: { name: 'n', author: null } },
      ])
      .mockResolvedValue([
        { content: SPLITTABLE, ayah: { ayahNumber: 5, textSimple: AYAHS[0].text } },
        { content: SPLITTABLE + 'َ', ayah: { ayahNumber: 6, textSimple: AYAHS[1].text } }, // differs by a haraka
      ]);
    const [t] = await service.forAyah(99);
    expect(t.passage).toBeNull();
  });

  it('forAyah() keeps only the unbroken run of ayahs around the selected one', async () => {
    const { prisma, service } = withPassage(SPLITTABLE, AYAHS, 5);
    prisma.tafsir.findMany
      .mockReset()
      .mockResolvedValueOnce([
        { bookId: 1, content: SPLITTABLE, book: { name: 'n', author: null } },
      ])
      .mockResolvedValue([
        { content: SPLITTABLE, ayah: { ayahNumber: 5, textSimple: AYAHS[0].text } },
        { content: SPLITTABLE, ayah: { ayahNumber: 6, textSimple: AYAHS[1].text } },
        { content: SPLITTABLE, ayah: { ayahNumber: 40, textSimple: 'x' } }, // same text far away
      ]);
    const [t] = await service.forAyah(99);
    expect(t.passage).toMatchObject({ fromAyah: 5, toAyah: 6 });
  });

  it('forAyah() throws 404 for an unknown ayah without reading tafsirs', async () => {
    const { prisma, service } = setup();
    prisma.ayah.findUnique.mockResolvedValue(null);
    await expect(service.forAyah(99999)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.tafsir.findMany).not.toHaveBeenCalled();
  });
});
