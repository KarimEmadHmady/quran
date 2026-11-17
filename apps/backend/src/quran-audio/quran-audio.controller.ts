import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  AyahAudioService,
  type AyahAudioResponse,
  type SuraAudioResponse,
} from './ayah-audio.service';
import {
  AyahAudioParamsDto,
  ReciterParamDto,
  ReciterQueryDto,
  SurahAudioParamsDto,
  SurahReciterQueryDto,
} from './dto/quran-audio.dto';
import { RecitersService, type PublicReciter, type RecitersList } from './reciters.service';
import {
  SurahRecitersService,
  type SurahFileResponse,
  type SurahRecitersList,
} from './surah-reciters.service';

/**
 * Public Quran audio API (read-only; same conventions as /suras: strict params, unknown query
 * parameters = 400, default throttler). Audio URLs point to the official AlQuran Cloud CDN and
 * are only returned once matched to the exact ayah (see AyahAudioService).
 *
 *   GET /quran-audio/reciters
 *   GET /quran-audio/reciters/:identifier
 *   GET /quran-audio/ayah/:surahNumber/:ayahNumber?reciter=ar.alafasy
 *   GET /quran-audio/surah/:surahNumber?reciter=ar.alafasy        (ayah-by-ayah playlist, Mode A)
 *
 * Full-sura audio (Mode B, one MP3 per sura; a SEPARATE reciter list):
 *   GET /quran-audio/full-surah-reciters
 *   GET /quran-audio/full-surah/:surahNumber?reciter=ar.alafasy
 */
@Controller('quran-audio')
export class QuranAudioController {
  constructor(
    private readonly reciters: RecitersService,
    private readonly audio: AyahAudioService,
    private readonly surahReciters: SurahRecitersService,
  ) {}

  @Get('full-surah-reciters')
  fullSurahReciters(): Promise<SurahRecitersList> {
    return this.surahReciters.list();
  }

  @Get('full-surah/:surahNumber')
  async fullSurah(
    @Param() { surahNumber }: SurahAudioParamsDto,
    @Query() { reciter }: SurahReciterQueryDto,
  ): Promise<SurahFileResponse> {
    let id = reciter;
    if (!id) {
      const { defaultReciter } = await this.surahReciters.list();
      if (!defaultReciter) throw new NotFoundException('No full-sura reciter is available');
      id = defaultReciter;
    }
    return this.surahReciters.file(surahNumber, id);
  }

  @Get('reciters')
  list(): Promise<RecitersList> {
    return this.reciters.list();
  }

  @Get('reciters/:identifier')
  async one(@Param() { identifier }: ReciterParamDto): Promise<PublicReciter> {
    const r = await this.reciters.resolve(identifier);
    return {
      identifier: r.identifier,
      name: r.name,
      englishName: r.englishName,
      language: r.language,
      format: r.format,
      type: r.type,
      bitrate: r.bitrate,
    };
  }

  @Get('ayah/:surahNumber/:ayahNumber')
  async ayah(
    @Param() { surahNumber, ayahNumber }: AyahAudioParamsDto,
    @Query() { reciter }: ReciterQueryDto,
  ): Promise<AyahAudioResponse> {
    return this.audio.ayah(surahNumber, ayahNumber, reciter ?? (await this.defaultReciter()));
  }

  @Get('surah/:surahNumber')
  async surah(
    @Param() { surahNumber }: SurahAudioParamsDto,
    @Query() { reciter }: ReciterQueryDto,
  ): Promise<SuraAudioResponse> {
    return this.audio.sura(surahNumber, reciter ?? (await this.defaultReciter()));
  }

  private async defaultReciter(): Promise<string> {
    const { defaultReciter } = await this.reciters.list().catch(() => {
      throw new ServiceUnavailableException('Reciters are temporarily unavailable');
    });
    if (!defaultReciter) throw new NotFoundException('No reciter is available');
    return defaultReciter;
  }
}
