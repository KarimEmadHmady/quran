import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/** Max ayahs per PDF (same as the frontend cart). */
export const MAX_EXPORT_ITEMS = 100;

/** One `quran_cart` entry (spec 4.1 / §3). */
export class ExportItemDto {
  @IsInt()
  @Min(1)
  @Max(4_294_967_295) // ayahs.id is INT UNSIGNED
  ayahId!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(255) // tafsir_books.id is TINYINT UNSIGNED
  tafsirBookId?: number;
}

/** POST /export/pdf body: `{ items: { ayahId; tafsirBookId? }[] }` (spec 4.1). */
export class ExportPdfDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_EXPORT_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => ExportItemDto)
  items!: ExportItemDto[];
}
