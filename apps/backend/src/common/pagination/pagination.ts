import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { toStrictInt } from '../validation/transforms';

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE = 10_000;

/** `?page=&limit=` — page is 1-based; limit is capped at MAX_PAGE_SIZE (100). */
export class PaginationQueryDto {
  @IsOptional()
  @Transform(toStrictInt)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE)
  page: number = 1;

  @IsOptional()
  @Transform(toStrictInt)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit: number = DEFAULT_PAGE_SIZE;
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function toSkipTake({ page, limit }: PaginationQueryDto): { skip: number; take: number } {
  return { skip: (page - 1) * limit, take: limit };
}

export function buildPageMeta({ page, limit }: PaginationQueryDto, total: number): PageMeta {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}
