import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { normalize } from '@quran/text-utils';
import {
  buildPageMeta,
  toSkipTake,
  type PageMeta,
  type PaginationQueryDto,
} from '../../common/pagination/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { AYAH_PUBLIC_SELECT, type PublicAyah } from '../../quran/ayah.select';
import { HIDDEN_TAFSIR_BOOK_IDS } from '../../quran/tafsirs/tafsir.constants';
import { SearchIndexService } from '../../search/index/search-index.service';
import type {
  CreateTopicDto,
  ListTopicsQueryDto,
  UpdateSuraDto,
  UpdateTafsirBookDto,
  UpdateTopicDto,
} from './dto/admin-content.dto';
import { descendantIds, hiddenMap, titleKey, type TopicRow } from './topic-admin';

// ------------------------------------------------------------------ response shapes

export interface AdminStats {
  suras: number;
  ayahs: number;
  topics: { total: number; banned: number; hidden: number };
  topicLinks: number;
  tafsirBooks: { total: number; visible: number };
  tafsirs: number;
}

export interface AdminSura {
  number: number;
  nameAr: string;
  nameEn: string;
  ayahCount: number;
  revelationPlace: string | null;
}

export interface SuraUpdateResult {
  sura: AdminSura;
  /** Reference search reads sura names from the index, so a rename triggers a rebuild. */
  reindex: 'done' | 'failed';
}

/** Admin topic shape: banned topics included; never legacyUuid / titleRaw. */
export interface AdminTopic {
  id: number;
  parentId: number | null;
  title: string;
  description: string | null;
  isBanned: boolean;
  /** Hidden from the public API (banned itself, or under a banned / missing parent). */
  hidden: boolean;
  ayahCount: number;
  childrenCount: number;
}

export interface AdminTopicDetails extends AdminTopic {
  parent: { id: number; title: string } | null;
  children: { id: number; title: string; isBanned: boolean }[];
}

export interface AdminTafsirBook {
  id: number;
  name: string;
  author: string | null;
  /** Hidden from the public API (HIDDEN_TAFSIR_BOOK_IDS, kept in code). */
  hidden: boolean;
  /** Rows with content (NULL rows are never served). */
  tafsirCount: number;
}

export interface AdminTafsirEntry {
  bookId: number;
  bookName: string;
  hidden: boolean;
  content: string;
}

const SURA_SELECT = {
  number: true,
  nameAr: true,
  nameEn: true,
  ayahCount: true,
  revelationPlace: true,
} as const satisfies Prisma.SuraSelect;

const TOPIC_ADMIN_SELECT = {
  id: true,
  parentId: true,
  title: true,
  description: true,
  isBanned: true,
  _count: { select: { ayahLinks: true, children: true } },
} as const satisfies Prisma.CategorySelect;

type TopicAdminRow = Prisma.CategoryGetPayload<{ select: typeof TOPIC_ADMIN_SELECT }>;

const BOOK_SELECT = {
  id: true,
  name: true,
  author: true,
} as const satisfies Prisma.TafsirBookSelect;

function requireChanges(dto: object): void {
  if (!Object.values(dto).some((v) => v !== undefined)) {
    throw new BadRequestException('Nothing to update');
  }
}

/**
 * Phase 6 admin content. Editable: topics (create / edit / ban / delete / ayah links), sura
 * names, tafsir book name & author. Read-only by design: ayah text and tafsir text (no write
 * path exists here). Every route is under /admin, so the global AdminAuthGuard protects it.
 */
@Injectable()
export class AdminContentService {
  private readonly logger = new Logger('AdminContent');

  constructor(
    private readonly prisma: PrismaService,
    private readonly searchIndex: SearchIndexService,
  ) {}

  /** Audit line: who did what to which id. Never logs submitted text. */
  private audit(adminId: number, action: string, target: string | number): void {
    this.logger.log(`admin=${adminId} ${action} ${target}`);
  }

  // ---------------------------------------------------------------- stats

  async stats(): Promise<AdminStats> {
    const [suras, ayahs, topicRows, topicLinks, books, tafsirs] = await Promise.all([
      this.prisma.sura.count(),
      this.prisma.ayah.count(),
      this.prisma.category.findMany({
        select: { id: true, parentId: true, title: true, isBanned: true },
      }),
      this.prisma.categoryAyah.count(),
      this.prisma.tafsirBook.findMany({ select: { id: true } }),
      this.prisma.tafsir.count({ where: { content: { not: null } } }),
    ]);
    const hidden = hiddenMap(topicRows);
    return {
      suras,
      ayahs,
      topics: {
        total: topicRows.length,
        banned: topicRows.filter((t) => t.isBanned).length,
        hidden: [...hidden.values()].filter(Boolean).length,
      },
      topicLinks,
      tafsirBooks: {
        total: books.length,
        visible: books.filter((b) => !HIDDEN_TAFSIR_BOOK_IDS.includes(b.id)).length,
      },
      tafsirs,
    };
  }

  // ---------------------------------------------------------------- suras

  listSuras(): Promise<AdminSura[]> {
    return this.prisma.sura.findMany({ select: SURA_SELECT, orderBy: { number: 'asc' } });
  }

  async updateSura(adminId: number, number: number, dto: UpdateSuraDto): Promise<SuraUpdateResult> {
    requireChanges(dto);
    const suras = await this.listSuras();
    const current = suras.find((s) => s.number === number);
    if (!current) throw new NotFoundException(`Sura ${number} not found`);

    // Reference search resolves names after normalize(); two suras with the same key would make
    // "<name> 5" ambiguous, so they are rejected.
    if (dto.nameAr !== undefined) {
      const key = normalize(dto.nameAr);
      if (!key) throw new BadRequestException('nameAr must contain Arabic letters');
      const clash = suras.find((s) => s.number !== number && normalize(s.nameAr) === key);
      if (clash) throw new ConflictException(`Sura ${clash.number} already uses this Arabic name`);
    }
    if (dto.nameEn !== undefined) {
      const key = dto.nameEn.toLowerCase();
      const clash = suras.find((s) => s.number !== number && s.nameEn.toLowerCase() === key);
      if (clash) throw new ConflictException(`Sura ${clash.number} already uses this English name`);
    }

    const sura = await this.prisma.sura.update({
      where: { number },
      data: { nameAr: dto.nameAr, nameEn: dto.nameEn },
      select: SURA_SELECT,
    });
    this.audit(adminId, 'updated sura', number);

    let reindex: SuraUpdateResult['reindex'] = 'done';
    if (dto.nameAr !== undefined && dto.nameAr !== current.nameAr) {
      try {
        await this.searchIndex.rebuild();
      } catch {
        reindex = 'failed'; // logged by SearchIndexService; the old index keeps serving
      }
    }
    return { sura, reindex };
  }

  // ---------------------------------------------------------------- topics

  private async allTopics(): Promise<TopicAdminRow[]> {
    return this.prisma.category.findMany({ select: TOPIC_ADMIN_SELECT, orderBy: { id: 'asc' } });
  }

  private static toAdminTopic(row: TopicAdminRow, hidden: Map<number, boolean>): AdminTopic {
    return {
      id: row.id,
      parentId: row.parentId,
      title: row.title,
      description: row.description,
      isBanned: row.isBanned,
      hidden: hidden.get(row.id) ?? true,
      ayahCount: row._count.ayahLinks,
      childrenCount: row._count.children,
    };
  }

  /** 183 rows today: filtering / paging in memory keeps the hidden rule in one place. */
  async listTopics(
    query: ListTopicsQueryDto,
  ): Promise<{ data: AdminTopic[]; pagination: PageMeta }> {
    const rows = await this.allTopics();
    const hidden = hiddenMap(rows);
    const needle = query.q ? titleKey(query.q) : '';
    const filtered = rows
      .map((r) => AdminContentService.toAdminTopic(r, hidden))
      .filter((t) => (query.status === 'banned' ? t.isBanned : true))
      .filter((t) => (query.status === 'visible' ? !t.hidden : true))
      .filter((t) => !needle || titleKey(t.title).includes(needle) || String(t.id) === query.q);
    const { skip, take } = toSkipTake(query);
    return {
      data: filtered.slice(skip, skip + take),
      pagination: buildPageMeta(query, filtered.length),
    };
  }

  async getTopic(id: number): Promise<AdminTopicDetails> {
    const rows = await this.allTopics();
    const row = rows.find((r) => r.id === id);
    if (!row) throw new NotFoundException(`Topic ${id} not found`);
    const hidden = hiddenMap(rows);
    const parent = row.parentId === null ? undefined : rows.find((r) => r.id === row.parentId);
    return {
      ...AdminContentService.toAdminTopic(row, hidden),
      parent: parent ? { id: parent.id, title: parent.title } : null,
      children: rows
        .filter((r) => r.parentId === id)
        .map((r) => ({ id: r.id, title: r.title, isBanned: r.isBanned })),
    };
  }

  private assertUniqueTitle(
    rows: readonly TopicRow[],
    title: string,
    parentId: number | null,
    exceptId?: number,
  ): void {
    const key = titleKey(title);
    if (!key) throw new BadRequestException('title must contain letters or digits');
    const clash = rows.find(
      (r) => r.id !== exceptId && r.parentId === parentId && titleKey(r.title) === key,
    );
    if (clash) {
      throw new ConflictException(
        `A topic with this title already exists under the same parent (id ${clash.id})`,
      );
    }
  }

  async createTopic(adminId: number, dto: CreateTopicDto): Promise<AdminTopicDetails> {
    const rows = await this.allTopics();
    const parentId = dto.parentId ?? null;
    if (parentId !== null && !rows.some((r) => r.id === parentId)) {
      throw new BadRequestException(`Parent topic ${parentId} does not exist`);
    }
    this.assertUniqueTitle(rows, dto.title, parentId);

    // Explicit field list: nothing from the request reaches Prisma unless named here.
    const created = await this.prisma.category.create({
      data: { title: dto.title, description: dto.description ?? null, parentId, isBanned: false },
      select: { id: true },
    });
    this.audit(adminId, 'created topic', created.id);
    return this.getTopic(created.id);
  }

  async updateTopic(adminId: number, id: number, dto: UpdateTopicDto): Promise<AdminTopicDetails> {
    requireChanges(dto);
    const rows = await this.allTopics();
    const row = rows.find((r) => r.id === id);
    if (!row) throw new NotFoundException(`Topic ${id} not found`);

    const parentId = dto.parentId === undefined ? row.parentId : dto.parentId;
    if (dto.parentId !== undefined && dto.parentId !== null) {
      if (dto.parentId === id) throw new BadRequestException('A topic cannot be its own parent');
      if (!rows.some((r) => r.id === dto.parentId)) {
        throw new BadRequestException(`Parent topic ${dto.parentId} does not exist`);
      }
      if (descendantIds(rows, id).has(dto.parentId)) {
        throw new BadRequestException('A topic cannot be moved under one of its own sub-topics');
      }
    }
    if (dto.title !== undefined || dto.parentId !== undefined) {
      this.assertUniqueTitle(rows, dto.title ?? row.title, parentId, id);
    }

    await this.prisma.category.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        parentId: dto.parentId,
        isBanned: dto.isBanned,
      },
      select: { id: true },
    });
    this.audit(adminId, 'updated topic', id);
    return this.getTopic(id);
  }

  async deleteTopic(adminId: number, id: number): Promise<void> {
    const row = await this.prisma.category.findUnique({
      where: { id },
      select: { id: true, _count: { select: { children: true } } },
    });
    if (!row) throw new NotFoundException(`Topic ${id} not found`);
    if (row._count.children > 0) {
      throw new ConflictException('Delete or move the sub-topics first');
    }
    // category_ayah rows go with it (FK ON DELETE CASCADE); ayahs themselves are untouched.
    await this.prisma.category.delete({ where: { id } });
    this.audit(adminId, 'deleted topic', id);
  }

  // ---------------------------------------------------------------- topic <-> ayah links

  private async requireTopic(id: number): Promise<void> {
    const found = await this.prisma.category.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new NotFoundException(`Topic ${id} not found`);
  }

  async topicAyahs(
    id: number,
    paging: PaginationQueryDto,
  ): Promise<{ data: PublicAyah[]; pagination: PageMeta }> {
    await this.requireTopic(id);
    const where = { categoryLinks: { some: { categoryId: id } } } satisfies Prisma.AyahWhereInput;
    const [data, total] = await Promise.all([
      this.prisma.ayah.findMany({
        where,
        select: AYAH_PUBLIC_SELECT,
        orderBy: { id: 'asc' },
        ...toSkipTake(paging),
      }),
      this.prisma.ayah.count({ where }),
    ]);
    return { data, pagination: buildPageMeta(paging, total) };
  }

  async linkAyahs(
    adminId: number,
    id: number,
    ayahIds: number[],
  ): Promise<{ added: number[]; skipped: number[] }> {
    await this.requireTopic(id);
    const ids = [...new Set(ayahIds)];
    const existing = await this.prisma.ayah.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    const found = new Set(existing.map((a) => a.id));
    const missing = ids.filter((a) => !found.has(a));
    if (missing.length) throw new NotFoundException(`Ayah(s) not found: ${missing.join(', ')}`);

    const linked = await this.prisma.categoryAyah.findMany({
      where: { categoryId: id, ayahId: { in: ids } },
      select: { ayahId: true },
    });
    const already = new Set(linked.map((l) => l.ayahId));
    const added = ids.filter((a) => !already.has(a));
    if (added.length) {
      await this.prisma.categoryAyah.createMany({
        data: added.map((ayahId) => ({ categoryId: id, ayahId })),
        skipDuplicates: true,
      });
      this.audit(adminId, `linked ${added.length} ayah(s) to topic`, id);
    }
    return { added, skipped: ids.filter((a) => already.has(a)) };
  }

  async unlinkAyah(adminId: number, id: number, ayahId: number): Promise<void> {
    await this.requireTopic(id);
    const { count } = await this.prisma.categoryAyah.deleteMany({
      where: { categoryId: id, ayahId },
    });
    if (count === 0) throw new NotFoundException(`Ayah ${ayahId} is not linked to topic ${id}`);
    this.audit(adminId, `unlinked ayah ${ayahId} from topic`, id);
  }

  // ---------------------------------------------------------------- ayahs (read-only)

  async ayahsOfSura(
    sura: number,
    paging: PaginationQueryDto,
  ): Promise<{ sura: AdminSura; data: PublicAyah[]; pagination: PageMeta }> {
    const found = await this.prisma.sura.findUnique({
      where: { number: sura },
      select: SURA_SELECT,
    });
    if (!found) throw new NotFoundException(`Sura ${sura} not found`);
    const data = await this.prisma.ayah.findMany({
      where: { suraNumber: sura },
      select: AYAH_PUBLIC_SELECT,
      orderBy: { ayahNumber: 'asc' },
      ...toSkipTake(paging),
    });
    return { sura: found, data, pagination: buildPageMeta(paging, found.ayahCount) };
  }

  /** ["2:255", "1:1"] -> the ayahs in request order (deduplicated) + the references not found. */
  async lookupAyahs(refs: string[]): Promise<{ data: PublicAyah[]; missing: string[] }> {
    const key = ([s, a]: [number, number]) => `${s}:${a}`;
    // "02:7" and "2:7" are the same reference.
    const pairs = [
      ...new Map(
        refs.map((r) => {
          const p = r.split(':').map(Number) as [number, number];
          return [key(p), p] as const;
        }),
      ).values(),
    ];
    const rows = await this.prisma.ayah.findMany({
      where: { OR: pairs.map(([suraNumber, ayahNumber]) => ({ suraNumber, ayahNumber })) },
      select: AYAH_PUBLIC_SELECT,
    });
    const byRef = new Map(rows.map((r) => [key([r.suraNumber, r.ayahNumber]), r]));
    return {
      data: pairs.flatMap((p) => byRef.get(key(p)) ?? []),
      missing: pairs.filter((p) => !byRef.has(key(p))).map(key),
    };
  }

  // ---------------------------------------------------------------- tafsir

  async listTafsirBooks(): Promise<AdminTafsirBook[]> {
    const [books, counts] = await Promise.all([
      this.prisma.tafsirBook.findMany({ select: BOOK_SELECT, orderBy: { id: 'asc' } }),
      this.prisma.tafsir.groupBy({
        by: ['bookId'],
        where: { content: { not: null } },
        _count: { _all: true },
      }),
    ]);
    const byBook = new Map(counts.map((c) => [c.bookId, c._count._all]));
    return books.map((b) => ({
      ...b,
      hidden: HIDDEN_TAFSIR_BOOK_IDS.includes(b.id),
      tafsirCount: byBook.get(b.id) ?? 0,
    }));
  }

  async updateTafsirBook(
    adminId: number,
    id: number,
    dto: UpdateTafsirBookDto,
  ): Promise<AdminTafsirBook> {
    requireChanges(dto);
    const found = await this.prisma.tafsirBook.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new NotFoundException(`Tafsir book ${id} not found`);
    await this.prisma.tafsirBook.update({
      where: { id },
      data: { name: dto.name, author: dto.author },
      select: { id: true },
    });
    this.audit(adminId, 'updated tafsir book', id);
    const books = await this.listTafsirBooks();
    return books.find((b) => b.id === id)!;
  }

  /** Read-only. Every book (hidden ones flagged) so admins can review unconfirmed sources. */
  async tafsirsForAyah(ayahId: number): Promise<{ ayah: PublicAyah; data: AdminTafsirEntry[] }> {
    const ayah = await this.prisma.ayah.findUnique({
      where: { id: ayahId },
      select: AYAH_PUBLIC_SELECT,
    });
    if (!ayah) throw new NotFoundException(`Ayah ${ayahId} not found`);
    const rows = await this.prisma.tafsir.findMany({
      where: { ayahId, content: { not: null } },
      select: { bookId: true, content: true, book: { select: { name: true } } },
      orderBy: { bookId: 'asc' },
    });
    return {
      ayah,
      data: rows.map((r) => ({
        bookId: r.bookId,
        bookName: r.book.name,
        hidden: HIDDEN_TAFSIR_BOOK_IDS.includes(r.bookId),
        content: r.content ?? '',
      })),
    };
  }
}
