import { Module } from '@nestjs/common';
import { AdminQuranAudioController } from './admin-quran-audio.controller';
import { AlQuranCloudClient } from './alquran-cloud.client';
import { AudioAdminService, SurahAudioAdminService } from './audio-admin.service';
import { AudioSyncService } from './audio-sync.service';
import { AyahAudioService } from './ayah-audio.service';
import { QuranAudioController } from './quran-audio.controller';
import { QuranNumberingService } from './quran-numbering.service';
import { RecitersService } from './reciters.service';
import { SurahRecitersService } from './surah-reciters.service';

/**
 * Quran audio (AlQuran Cloud): reciters, per-ayah / per-sura audio resolution, admin sync.
 * Reads ayahs / suras (never writes them); writes only audio_reciters, ayah_audio and
 * audio_sync_jobs (prisma/sql/001_quran_audio.sql).
 */
@Module({
  controllers: [QuranAudioController, AdminQuranAudioController],
  providers: [
    AlQuranCloudClient,
    QuranNumberingService,
    RecitersService,
    AyahAudioService,
    AudioSyncService,
    AudioAdminService,
    SurahRecitersService,
    SurahAudioAdminService,
  ],
})
export class QuranAudioModule {}
