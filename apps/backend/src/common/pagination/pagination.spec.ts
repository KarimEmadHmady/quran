import { createValidationPipe } from '../validation/validation.pipe';
import { buildPageMeta, PaginationQueryDto, toSkipTake } from './pagination';

const pipe = createValidationPipe();
const parse = (query: Record<string, unknown>) =>
  pipe.transform(query, {
    type: 'query',
    metatype: PaginationQueryDto,
  }) as Promise<PaginationQueryDto>;

describe('PaginationQueryDto', () => {
  it('defaults to page 1, limit 50', async () => {
    await expect(parse({})).resolves.toEqual({ page: 1, limit: 50 });
  });

  it('accepts limit up to 100', async () => {
    await expect(parse({ page: '3', limit: '100' })).resolves.toEqual({ page: 3, limit: 100 });
  });

  it.each([
    { limit: '101' },
    { limit: '0' },
    { page: '0' },
    { page: '-1' },
    { page: '1.5' },
    { page: 'abc' },
    { page: ['1', '2'] },
    { page: '10001' },
  ])('rejects %p with 400', async (q) => {
    await expect(parse(q)).rejects.toMatchObject({ status: 400 });
  });
});

describe('toSkipTake / buildPageMeta', () => {
  it('computes offsets and totals', () => {
    expect(toSkipTake({ page: 3, limit: 20 })).toEqual({ skip: 40, take: 20 });
    expect(buildPageMeta({ page: 1, limit: 50 }, 286)).toEqual({
      page: 1,
      limit: 50,
      total: 286,
      totalPages: 6,
    });
    expect(buildPageMeta({ page: 1, limit: 50 }, 0).totalPages).toBe(0);
  });
});
