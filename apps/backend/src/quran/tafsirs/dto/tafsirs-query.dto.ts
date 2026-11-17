import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsOptional, Max, Min } from 'class-validator';
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

/** GET /tafsirs/available?ayah_ids=1,2,255 (up to 100 ids, e.g. one page of search results). */
export class TafsirAvailabilityQueryDto {
  @Transform(toIntList)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(4_294_967_295, { each: true }) // ayahs.id is INT UNSIGNED
  ayah_ids!: number[];
}
