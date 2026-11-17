import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination';
import { toStrictInt } from '../../../common/validation/transforms';

/** Trims strings; anything else is left for @IsString() to reject. */
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
/** Trims; an empty string becomes null (clears an optional text column). */
const trimOrNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const t = value.trim();
  return t === '' ? null : t;
};

/**
 * For non-nullable optional fields: absent (undefined) skips validation, but an explicit null is
 * validated (and rejected), so it can never reach a NOT NULL column. @IsOptional() would let null through.
 */
const present = (_o: object, v: unknown) => v !== undefined;

const UINT_MAX = 4_294_967_295;

// ------------------------------------------------------------------ suras

export class SuraNumberParamDto {
  @Transform(toStrictInt)
  @IsInt()
  @Min(1)
  @Max(114)
  number!: number;
}

/** PATCH /admin/suras/:number — only the names are editable (ayah_count is derived data). */
export class UpdateSuraDto {
  @ValidateIf(present)
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(60) // suras.name_ar VARCHAR(60)
  nameAr?: string;

  @ValidateIf(present)
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  nameEn?: string;
}

// ------------------------------------------------------------------ topics

export class IdParamDto {
  @Transform(toStrictInt)
  @IsInt()
  @Min(1)
  @Max(UINT_MAX)
  id!: number;
}

export class TopicAyahParamDto extends IdParamDto {
  @Transform(toStrictInt)
  @IsInt()
  @Min(1)
  @Max(UINT_MAX)
  ayahId!: number;
}

export const TOPIC_STATUSES = ['all', 'visible', 'banned'] as const;
export type TopicStatus = (typeof TOPIC_STATUSES)[number];

/** GET /admin/topics?q=&status=&page=&limit= */
export class ListTopicsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsIn(TOPIC_STATUSES)
  status: TopicStatus = 'all';
}

export class CreateTopicDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(255) // categories.title VARCHAR(255)
  title!: string;

  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  /** null / absent = a root topic. */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(UINT_MAX)
  parentId?: number | null;
}

export class UpdateTopicDto {
  @ValidateIf(present)
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(UINT_MAX)
  parentId?: number | null;

  /** Ban = hidden from every public endpoint, together with its whole subtree. */
  @ValidateIf(present)
  @IsBoolean()
  isBanned?: boolean;
}

/** POST /admin/topics/:id/ayahs */
export class LinkAyahsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(UINT_MAX, { each: true })
  ayahIds!: number[];
}

// ------------------------------------------------------------------ ayahs (read-only)

/** GET /admin/ayahs?sura=&page=&limit= */
export class ListAyahsQueryDto extends PaginationQueryDto {
  @Transform(toStrictInt)
  @IsInt()
  @Min(1)
  @Max(114)
  sura!: number;
}

// ------------------------------------------------------------------ tafsir

export class BookIdParamDto {
  @Transform(toStrictInt)
  @IsInt()
  @Min(0)
  @Max(255) // tafsir_books.id TINYINT UNSIGNED
  id!: number;
}

/** PATCH /admin/tafsir-books/:id — name / author only (visibility stays in code). */
export class UpdateTafsirBookDto {
  @ValidateIf(present)
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100) // tafsir_books.name VARCHAR(100)
  name?: string;

  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(150) // tafsir_books.author VARCHAR(150)
  author?: string | null;
}

/** GET /admin/tafsirs?ayah_id= (read-only). */
export class AdminTafsirsQueryDto {
  @Transform(toStrictInt)
  @IsInt()
  @Min(1)
  @Max(UINT_MAX)
  ayah_id!: number;
}

/** GET /admin/ayahs/lookup?refs=2:255,1:1 (1-100 references, sura:ayah). */
export class AyahLookupQueryDto {
  @IsString()
  @Matches(/^[0-9]{1,3}:[0-9]{1,3}(?:,[0-9]{1,3}:[0-9]{1,3}){0,99}$/, {
    message: 'refs must be 1-100 comma-separated references like 2:255',
  })
  refs!: string;
}
