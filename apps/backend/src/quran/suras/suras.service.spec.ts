import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import { AYAH_PUBLIC_SELECT } from '../ayah.select';
import { SURA_PUBLIC_SELECT, SurasService } from './suras.service';

const AL_FATIHA = String.fromCodePoint(0x0627, 0x0644, 0x0641, 0x0627, 0x062a, 0x062d, 0x0629);
const sura = {
  number: 1,
  nameAr: AL_FATIHA,
  nameEn: 'Al-Faatiha',
  ayahCount: 7,
  revelationPlace: 'mecca',
};

function setup() {
  const prisma = {
    sura: { findMany: jest.fn(), findUnique: jest.fn() },
    ayah: { findMany: jest.fn(), count: jest.fn() },
  };
  return { prisma, service: new SurasService(prisma as unknown as PrismaService) };
}

describe('SurasService', () => {
  it('lists suras ordered by number with the public select only', async () => {
    const { prisma, service } = setup();
    prisma.sura.findMany.mockResolvedValue([sura]);
    await expect(service.list()).resolves.toEqual([sura]);
    expect(prisma.sura.findMany).toHaveBeenCalledWith({
      select: SURA_PUBLIC_SELECT,
      orderBy: { number: 'asc' },
    });
  });

  it('returns the sura with a page of ayahs and pagination meta', async () => {
    const { prisma, service } = setup();
    const ayah = {
      id: 1,
      suraNumber: 1,
      ayahNumber: 1,
      textUthmani: 'u',
      textSimple: 's',
      juz: 1,
      page: 1,
    };
    prisma.sura.findUnique.mockResolvedValue(sura);
    prisma.ayah.findMany.mockResolvedValue([ayah]);
    prisma.ayah.count.mockResolvedValue(7);

    const res = await service.findOne(1, { page: 2, limit: 5 });

    expect(res).toEqual({
      sura,
      ayahs: [ayah],
      pagination: { page: 2, limit: 5, total: 7, totalPages: 2 },
    });
    expect(prisma.ayah.findMany).toHaveBeenCalledWith({
      where: { suraNumber: 1 },
      select: AYAH_PUBLIC_SELECT,
      orderBy: { ayahNumber: 'asc' },
      skip: 5,
      take: 5,
    });
    expect(prisma.ayah.count).toHaveBeenCalledWith({ where: { suraNumber: 1 } });
  });

  it('throws 404 when the sura does not exist and skips the ayah queries', async () => {
    const { prisma, service } = setup();
    prisma.sura.findUnique.mockResolvedValue(null);
    await expect(service.findOne(1, { page: 1, limit: 50 })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.ayah.findMany).not.toHaveBeenCalled();
  });

  it('the ayah select is exactly the documented public fields', () => {
    expect(Object.keys(AYAH_PUBLIC_SELECT).sort()).toEqual(
      ['ayahNumber', 'id', 'juz', 'page', 'suraNumber', 'textSimple', 'textUthmani'].sort(),
    );
  });
});
