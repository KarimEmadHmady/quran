import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateBy,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination';

/** claude.md 10: untrusted input; fuzzy matching gets costlier with length. */
export const MAX_QUERY_LENGTH = 200;
export const MAX_QUERY_WORDS = 20;
/** claude.md 5.7: text, or voice (with optional `alts`). */
export const SEARCH_TYPES = ['text', 'voice'] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];
/** claude.md 5.10: Web Speech maxAlternatives=5. */
export const MAX_ALTS = 5;
/** Separator of STT alternatives in `alts` (a pipe never occurs in Arabic text). */
export const ALTS_SEPARATOR = '|';

export const countWords = (s: string): number => {
  const t = s.trim();
  return t === '' ? 0 : t.split(/\s+/).length;
};

/** `q` (and each alt): a non-blank string of at most 200 characters and 20 words. */
const QueryText = (each = false) =>
  applyDecorators(
    IsString({ each }),
    MaxLength(MAX_QUERY_LENGTH, { each }),
    Matches(/\S/, { each, message: '$property must not be blank' }),
    ValidateBy(
      {
        name: 'maxWords',
        validator: {
          validate: (v: unknown) => typeof v === 'string' && countWords(v) <= MAX_QUERY_WORDS,
          defaultMessage: () => `$property must have at most ${MAX_QUERY_WORDS} words`,
        },
      },
      { each },
    ),
  );

/** "a|b|c" -> ["a", "b", "c"]; anything but a string is left for the validators to reject. */
const toAlts = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.split(ALTS_SEPARATOR) : value;

/** `GET /search?q=&type=text|voice&alts=&page=&limit=` (claude.md 5.7 / 5.10). */
export class SearchQueryDto extends PaginationQueryDto {
  @QueryText()
  q!: string;

  @IsOptional()
  @IsIn(SEARCH_TYPES)
  type: SearchType = 'text';

  /**
   * Voice only (claude.md 5.10): the other STT transcripts, most likely first, joined by "|"
   * (`alts=قل هو الله احد|قل هو اللة احد`). At most 5, each limited like `q`.
   */
  @IsOptional()
  @Transform(toAlts)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_ALTS)
  @QueryText(true)
  @ValidateBy({
    name: 'altsNeedVoice',
    validator: {
      validate: (_v: unknown, args) =>
        (args?.object as SearchQueryDto | undefined)?.type === 'voice',
      defaultMessage: () => 'alts is only allowed with type=voice',
    },
  })
  alts?: string[];
}

/** `GET /search/suggest?q=` (claude.md 5.11). */
export class SuggestQueryDto {
  @QueryText()
  q!: string;
}
