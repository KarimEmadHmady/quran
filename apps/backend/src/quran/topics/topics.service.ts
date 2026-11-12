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
import { buildTopicTree, visibleTopics, type PublicTopic, type TopicNode } from './topic-tree';

const TOPIC_PUBLIC_SELECT = {
  id: true,
  parentId: true,
  title: true,
  description: true,
} as const satisfies Prisma.CategorySelect;

export interface TopicWithAyahs {
  topic: PublicTopic;
  ayahs: PublicAyah[];
  pagination: PageMeta;
}

@Injectable()
export class TopicsService {
  constructor(private readonly prisma: PrismaService) {}

  /** All public topics (183 rows today: small enough to check ancestry in memory). */
  private async loadVisible(): Promise<PublicTopic[]> {
    const rows = await this.prisma.category.findMany({
      where: { isBanned: false },
      select: TOPIC_PUBLIC_SELECT,
      orderBy: { id: 'asc' },
    });
    return visibleTopics(rows);
  }

  list(): Promise<PublicTopic[]> {
    return this.loadVisible();
  }

  async tree(): Promise<TopicNode[]> {
    return buildTopicTree(await this.loadVisible());
  }

  async findOne(id: number, paging: PaginationQueryDto): Promise<TopicWithAyahs> {
    const topic = (await this.loadVisible()).find((t) => t.id === id);
    // Same 404 for banned and missing, so a banned topic's existence is never revealed.
    if (!topic) throw new NotFoundException(`Topic ${id} not found`);

    const where = { categoryLinks: { some: { categoryId: id } } } satisfies Prisma.AyahWhereInput;
    const [ayahs, total] = await Promise.all([
      this.prisma.ayah.findMany({
        where,
        select: AYAH_PUBLIC_SELECT,
        orderBy: { id: 'asc' }, // ayah id order is mushaf order
        ...toSkipTake(paging),
      }),
      this.prisma.ayah.count({ where }),
    ]);
    return { topic, ayahs, pagination: buildPageMeta(paging, total) };
  }
}
