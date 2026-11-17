import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { PaginationQueryDto } from '../../common/pagination/pagination';
import type { PublicAyah } from '../../quran/ayah.select';
import type { AuthenticatedAdmin } from '../auth/admin-auth.guard';
import { CurrentAdmin } from '../auth/auth.controller';
import {
  AdminContentService,
  type AdminStats,
  type AdminSura,
  type AdminTafsirBook,
  type AdminTafsirEntry,
  type AdminTopic,
  type AdminTopicDetails,
  type SuraUpdateResult,
} from './admin-content.service';
import {
  AdminTafsirsQueryDto,
  AyahLookupQueryDto,
  BookIdParamDto,
  CreateTopicDto,
  IdParamDto,
  LinkAyahsDto,
  ListAyahsQueryDto,
  ListTopicsQueryDto,
  SuraNumberParamDto,
  TopicAyahParamDto,
  UpdateSuraDto,
  UpdateTafsirBookDto,
  UpdateTopicDto,
} from './dto/admin-content.dto';
import { PrismaErrorsInterceptor } from './prisma-errors.interceptor';
import type { PageMeta } from '../../common/pagination/pagination';

/*
 * Every controller below is mounted under /admin, so the global AdminAuthGuard rejects any
 * request without a valid admin session (401) before a handler runs. There are no roles in
 * this app: every admin account has the same rights, and nothing from the request body can
 * change that (DTOs are whitelisted; unknown fields such as "role" or "id" are a 400).
 */

@Controller('admin/stats')
export class AdminStatsController {
  constructor(private readonly content: AdminContentService) {}

  @Get()
  stats(): Promise<AdminStats> {
    return this.content.stats();
  }
}

@Controller('admin/suras')
@UseInterceptors(PrismaErrorsInterceptor)
export class AdminSurasController {
  constructor(private readonly content: AdminContentService) {}

  @Get()
  async list(): Promise<{ data: AdminSura[] }> {
    return { data: await this.content.listSuras() };
  }

  @Patch(':number')
  update(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Param() { number }: SuraNumberParamDto,
    @Body() dto: UpdateSuraDto,
  ): Promise<SuraUpdateResult> {
    return this.content.updateSura(admin.id, number, dto);
  }
}

@Controller('admin/topics')
@UseInterceptors(PrismaErrorsInterceptor)
export class AdminTopicsController {
  constructor(private readonly content: AdminContentService) {}

  @Get()
  list(@Query() query: ListTopicsQueryDto): Promise<{ data: AdminTopic[]; pagination: PageMeta }> {
    return this.content.listTopics(query);
  }

  @Get(':id')
  get(@Param() { id }: IdParamDto): Promise<AdminTopicDetails> {
    return this.content.getTopic(id);
  }

  @Post()
  @HttpCode(201)
  create(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() dto: CreateTopicDto,
  ): Promise<AdminTopicDetails> {
    return this.content.createTopic(admin.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Param() { id }: IdParamDto,
    @Body() dto: UpdateTopicDto,
  ): Promise<AdminTopicDetails> {
    return this.content.updateTopic(admin.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentAdmin() admin: AuthenticatedAdmin, @Param() { id }: IdParamDto): Promise<void> {
    return this.content.deleteTopic(admin.id, id);
  }

  @Get(':id/ayahs')
  ayahs(
    @Param() { id }: IdParamDto,
    @Query() paging: PaginationQueryDto,
  ): Promise<{ data: PublicAyah[]; pagination: PageMeta }> {
    return this.content.topicAyahs(id, paging);
  }

  @Post(':id/ayahs')
  @HttpCode(200)
  link(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Param() { id }: IdParamDto,
    @Body() { ayahIds }: LinkAyahsDto,
  ): Promise<{ added: number[]; skipped: number[] }> {
    return this.content.linkAyahs(admin.id, id, ayahIds);
  }

  @Delete(':id/ayahs/:ayahId')
  @HttpCode(204)
  unlink(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Param() { id, ayahId }: TopicAyahParamDto,
  ): Promise<void> {
    return this.content.unlinkAyah(admin.id, id, ayahId);
  }
}

/** Read-only: ayah text is never editable from the dashboard. */
@Controller('admin/ayahs')
export class AdminAyahsController {
  constructor(private readonly content: AdminContentService) {}

  @Get()
  list(
    @Query() query: ListAyahsQueryDto,
  ): Promise<{ sura: AdminSura; data: PublicAyah[]; pagination: PageMeta }> {
    return this.content.ayahsOfSura(query.sura, query);
  }

  @Get('lookup')
  lookup(
    @Query() { refs }: AyahLookupQueryDto,
  ): Promise<{ data: PublicAyah[]; missing: string[] }> {
    return this.content.lookupAyahs(refs.split(','));
  }
}

@Controller('admin/tafsir-books')
@UseInterceptors(PrismaErrorsInterceptor)
export class AdminTafsirBooksController {
  constructor(private readonly content: AdminContentService) {}

  @Get()
  async list(): Promise<{ data: AdminTafsirBook[] }> {
    return { data: await this.content.listTafsirBooks() };
  }

  @Patch(':id')
  update(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Param() { id }: BookIdParamDto,
    @Body() dto: UpdateTafsirBookDto,
  ): Promise<AdminTafsirBook> {
    return this.content.updateTafsirBook(admin.id, id, dto);
  }
}

/** Read-only: tafsir text is never editable from the dashboard. */
@Controller('admin/tafsirs')
export class AdminTafsirsController {
  constructor(private readonly content: AdminContentService) {}

  @Get()
  list(
    @Query() { ayah_id }: AdminTafsirsQueryDto,
  ): Promise<{ ayah: PublicAyah; data: AdminTafsirEntry[] }> {
    return this.content.tafsirsForAyah(ayah_id);
  }
}
