import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseInterceptors,
} from '@nestjs/common';
import type { AuthenticatedAdmin } from '../admin/auth/admin-auth.guard';
import { CurrentAdmin } from '../admin/auth/auth.controller';
import { PrismaErrorsInterceptor } from '../admin/content/prisma-errors.interceptor';
import {
  AudioAdminService,
  type AdminEdition,
  type AdminReciter,
  type AudioOverview,
  SurahAudioAdminService,
  type AdminSurahReciter,
  type AdminSurahReciters,
} from './audio-admin.service';
import type { SurahReciterSyncResult } from './surah-reciters.service';
import { AudioSyncService, type PublicJob } from './audio-sync.service';
import {
  ReciterParamDto,
  SyncAudioDto,
  SurahReciterParamDto,
  SyncRecitersDto,
  UpdateReciterDto,
} from './dto/quran-audio.dto';

/**
 * Quran audio administration. Mounted under /admin, so the global AdminAuthGuard requires the
 * admin session cookie (401 otherwise) before any handler runs; ordinary users can never start
 * a synchronization. Syncs run in the background (202 + job); progress via GET sync/status.
 *
 *   GET   /admin/quran-audio/overview
 *   GET   /admin/quran-audio/editions
 *   PATCH /admin/quran-audio/reciters/:identifier   { isActive }
 *   POST  /admin/quran-audio/sync/reciters           { force? }
 *   POST  /admin/quran-audio/sync/audio              { resume?, reciters? }
 *   GET   /admin/quran-audio/sync/status
 *
 * Full-sura reciters (one MP3 per sura; separate catalogue):
 *   GET   /admin/quran-audio/surah-reciters
 *   POST  /admin/quran-audio/sync/surah-reciters      (synchronous: CDN listing + names)
 *   PATCH /admin/quran-audio/surah-reciters/:identifier { isActive }
 */
@Controller('admin/quran-audio')
@UseInterceptors(PrismaErrorsInterceptor)
export class AdminQuranAudioController {
  constructor(
    private readonly admin: AudioAdminService,
    private readonly sync: AudioSyncService,
    private readonly surahAdmin: SurahAudioAdminService,
  ) {}

  @Get('surah-reciters')
  surahReciters(): Promise<AdminSurahReciters> {
    return this.surahAdmin.list();
  }

  @Post('sync/surah-reciters')
  @HttpCode(200)
  syncSurahReciters(@CurrentAdmin() admin: AuthenticatedAdmin): Promise<SurahReciterSyncResult> {
    return this.surahAdmin.sync(admin.id);
  }

  @Patch('surah-reciters/:identifier')
  setSurahReciterActive(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Param() { identifier }: SurahReciterParamDto,
    @Body() { isActive }: UpdateReciterDto,
  ): Promise<AdminSurahReciter> {
    return this.surahAdmin.setActive(admin.id, identifier, isActive);
  }

  @Get('overview')
  overview(): Promise<AudioOverview> {
    return this.admin.overview();
  }

  @Get('editions')
  editions(): Promise<{ data: AdminEdition[] }> {
    return this.admin.editions();
  }

  @Patch('reciters/:identifier')
  setActive(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Param() { identifier }: ReciterParamDto,
    @Body() { isActive }: UpdateReciterDto,
  ): Promise<AdminReciter> {
    return this.admin.setActive(admin.id, identifier, isActive);
  }

  @Post('sync/reciters')
  @HttpCode(202)
  syncReciters(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() { force }: SyncRecitersDto,
  ): Promise<PublicJob> {
    return this.sync.startReciterSync(admin.id, force ?? false);
  }

  @Post('sync/audio')
  @HttpCode(202)
  syncAudio(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() dto: SyncAudioDto,
  ): Promise<PublicJob> {
    return this.sync.startAudioSync(admin.id, { resume: dto.resume, reciters: dto.reciters });
  }

  @Get('sync/status')
  status(): ReturnType<AudioSyncService['status']> {
    return this.sync.status();
  }
}
