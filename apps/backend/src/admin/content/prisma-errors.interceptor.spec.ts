import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { lastValueFrom, throwError } from 'rxjs';
import { mapPrismaError, PrismaErrorsInterceptor } from './prisma-errors.interceptor';

const known = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('db detail: table `categories`', {
    code,
    clientVersion: 'test',
  });

describe('mapPrismaError', () => {
  it.each([
    ['P2025', NotFoundException],
    ['P2002', ConflictException],
    ['P2003', ConflictException],
  ])('%s -> %p with a generic message (no DB details)', (code, type) => {
    const mapped = mapPrismaError(known(code));
    expect(mapped).toBeInstanceOf(type);
    expect((mapped as Error).message).not.toContain('categories');
  });

  it('passes other errors through unchanged', () => {
    const other = known('P1001');
    expect(mapPrismaError(other)).toBe(other);
    const plain = new Error('x');
    expect(mapPrismaError(plain)).toBe(plain);
  });

  it('is applied by the interceptor', async () => {
    const out = new PrismaErrorsInterceptor().intercept({} as never, {
      handle: () => throwError(() => known('P2025')),
    });
    await expect(lastValueFrom(out)).rejects.toBeInstanceOf(NotFoundException);
  });
});
