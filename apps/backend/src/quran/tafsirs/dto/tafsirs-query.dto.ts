import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsOptional, Max, Min } from 'class-validator';
import { toIntList, toStrictInt } from '../../../common/validation/transforms';

export class TafsirsQueryDto {
  @Transform(toStrictInt)
  @IsInt()
  @Min(1)
  @Max(4_294_967_295) // ayahs.id is INT UNSIGNED
  ayah_id!: number;

  /** Comma-separated book ids, e.g. `book_ids=1,5`. */
  @IsOptional()
  @Transform(toIntList)
  @IsArray()
  @ArrayMaxSize(20)
  @IsInt({ each: true })
  @Max(255, { each: true }) // tafsir_books.id is TINYINT UNSIGNED
  book_ids?: number[];
}
