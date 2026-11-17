import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { toStrictInt } from '../../common/validation/transforms';
import { RECITER_ID_PATTERN, SURAH_RECITER_ID_PATTERN } from '../quran-audio.constants';

const RECITER_MESSAGE = 'reciter must be an edition identifier such as ar.alafasy';

export class ReciterParamDto {
  @IsString()
  @Matches(RECITER_ID_PATTERN, { message: RECITER_MESSAGE })
  identifier!: string;
}

/** `?reciter=` (optional: the default reciter is used when absent). */
export class ReciterQueryDto {
  @IsOptional()
  @IsString()
  @Matches(RECITER_ID_PATTERN, { message: RECITER_MESSAGE })
  reciter?: string;
}

export class SurahAudioParamsDto {
  @Transform(toStrictInt)
  @IsInt()
  @Min(1)
  @Max(114)
  surahNumber!: number;
}

export class AyahAudioParamsDto extends SurahAudioParamsDto {
  /** Upper bound of any sura (286); the real per-sura bound is checked by the service (404). */
  @Transform(toStrictInt)
  @IsInt()
  @Min(1)
  @Max(286)
  ayahNumber!: number;
}

// ------------------------------------------------------------------ admin

export class SyncRecitersDto {
  /** true = re-verify every reciter's CDN pattern ("refresh metadata"); false = only new / unverified. */
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

export class SyncAudioDto {
  /** Resume the last interrupted / failed audio sync instead of starting a new one. */
  @IsOptional()
  @IsBoolean()
  resume?: boolean;

  /** Limit a new sync to these reciters (default: every active, verified reciter). */
  @ValidateIf((o: SyncAudioDto) => o.reciters !== undefined)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @Matches(RECITER_ID_PATTERN, { each: true, message: RECITER_MESSAGE })
  reciters?: string[];
}

export class UpdateReciterDto {
  @IsBoolean()
  isActive!: boolean;
}

// ------------------------------------------------------------------ full-sura audio

const SURAH_RECITER_MESSAGE = 'reciter must be a full-sura reciter identifier such as ar.alafasy';

export class SurahReciterQueryDto {
  @IsOptional()
  @IsString()
  @Matches(SURAH_RECITER_ID_PATTERN, { message: SURAH_RECITER_MESSAGE })
  reciter?: string;
}

export class SurahReciterParamDto {
  @IsString()
  @Matches(SURAH_RECITER_ID_PATTERN, { message: SURAH_RECITER_MESSAGE })
  identifier!: string;
}
