import { Transform } from 'class-transformer';
import { IsInt, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { toStrictInt } from '../../common/validation/transforms';
import { ADHKAR_AUDIO_FILE, ADHKAR_SEARCH_MAX_LENGTH } from '../adhkar.constants';

export class AdhkarCategoryParamsDto {
  @Transform(toStrictInt)
  @IsInt()
  @Min(1)
  @Max(65_535) // adhkar_categories.id is SMALLINT UNSIGNED
  id!: number;
}

export class AdhkarItemParamsDto extends AdhkarCategoryParamsDto {
  @Transform(toStrictInt)
  @IsInt()
  @Min(1)
  @Max(65_535)
  itemNumber!: number;
}

export class AdhkarSearchQueryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(ADHKAR_SEARCH_MAX_LENGTH)
  q!: string;
}

export class AdhkarAudioParamsDto {
  @IsString()
  @Matches(ADHKAR_AUDIO_FILE, { message: 'file must be an adhkar audio file name such as 75.mp3' })
  file!: string;
}
