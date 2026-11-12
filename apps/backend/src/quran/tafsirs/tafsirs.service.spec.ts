import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import { HIDDEN_TAFSIR_BOOK_IDS } from './tafsir.constants';
import { TafsirsService } from './tafsirs.service';

function setup() {
  const prisma = {
    tafsirBook: { findMany: jest.fn().mockResolvedValue([{ id: 1, name: 'n', author: 'a' }]) },
    ayah: { findUnique: jest.fn().mockResolvedValue({ id: 1 }) },
    tafsir: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ bookId: 1, content: 'c', book: { name: 'n', author: null } }]),
    },
  };
  return { prisma, service: new TafsirsService(prisma as unknown as PrismaService) };
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
      { bookId: 1, bookName: 'n', author: null, content: 'c' },
    ]);
    expect(prisma.tafsir.findMany).toHaveBeenCalledWith({
      where: { ayahId: 1, content: { not: null }, bookId: { notIn: [0, 2, 3, 4] } },
      select: { bookId: true, content: true, book: { select: { name: true, author: true } } },
      orderBy: { bookId: 'asc' },
    });
  });

  it('forAyah() narrows to requested book_ids but still excludes placeholders', async () => {
    const { prisma, service } = setup();
    await service.forAyah(7, [1, 2]);
    expect(prisma.tafsir.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ayahId: 7, content: { not: null }, bookId: { notIn: [0, 2, 3, 4], in: [1, 2] } },
      }),
    );
  });

  it('forAyah() maps a null content defensively to an empty string', async () => {
    const { prisma, service } = setup();
    prisma.tafsir.findMany.mockResolvedValue([
      { bookId: 1, content: null, book: { name: 'n', author: 'a' } },
    ]);
    await expect(service.forAyah(1)).resolves.toEqual([
      { bookId: 1, bookName: 'n', author: 'a', content: '' },
    ]);
  });

  it('forAyah() throws 404 for an unknown ayah without reading tafsirs', async () => {
    const { prisma, service } = setup();
    prisma.ayah.findUnique.mockResolvedValue(null);
    await expect(service.forAyah(99999)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.tafsir.findMany).not.toHaveBeenCalled();
  });
});
