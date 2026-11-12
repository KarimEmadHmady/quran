import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import { AYAH_PUBLIC_SELECT } from '../ayah.select';
import { TopicsService } from './topics.service';

const rows = [
  { id: 1, parentId: null, title: 'a', description: null },
  { id: 2, parentId: 1, title: 'b', description: 'd' },
  { id: 51, parentId: 50, title: 'child of banned 50', description: null },
];

function setup() {
  const prisma = {
    category: { findMany: jest.fn().mockResolvedValue(rows) },
    ayah: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
  };
  return { prisma, service: new TopicsService(prisma as unknown as PrismaService) };
}

describe('TopicsService', () => {
  it('queries only non-banned rows and never selects internal columns', async () => {
    const { prisma, service } = setup();
    await service.list();
    expect(prisma.category.findMany).toHaveBeenCalledWith({
      where: { isBanned: false },
      select: { id: true, parentId: true, title: true, description: true },
      orderBy: { id: 'asc' },
    });
  });

  it('list() returns a flat list without the subtree of a banned parent', async () => {
    const { service } = setup();
    await expect(service.list()).resolves.toEqual([rows[0], rows[1]]);
  });

  it('tree() nests children', async () => {
    const { service } = setup();
    await expect(service.tree()).resolves.toEqual([
      { ...rows[0], children: [{ ...rows[1], children: [] }] },
    ]);
  });

  it('findOne() returns the topic with paginated ayahs in mushaf order', async () => {
    const { prisma, service } = setup();
    prisma.ayah.count.mockResolvedValue(120);
    const res = await service.findOne(2, { page: 2, limit: 100 });
    expect(res).toEqual({
      topic: rows[1],
      ayahs: [],
      pagination: { page: 2, limit: 100, total: 120, totalPages: 2 },
    });
    const where = { categoryLinks: { some: { categoryId: 2 } } };
    expect(prisma.ayah.findMany).toHaveBeenCalledWith({
      where,
      select: AYAH_PUBLIC_SELECT,
      orderBy: { id: 'asc' },
      skip: 100,
      take: 100,
    });
    expect(prisma.ayah.count).toHaveBeenCalledWith({ where });
  });

  it.each([
    [999, 'missing'],
    [50, 'banned (filtered out by the query)'],
    [51, 'child of a banned topic'],
  ])('findOne(%p) -> 404 (%s) without querying ayahs', async (id) => {
    const { prisma, service } = setup();
    await expect(service.findOne(id, { page: 1, limit: 50 })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.ayah.findMany).not.toHaveBeenCalled();
  });
});
