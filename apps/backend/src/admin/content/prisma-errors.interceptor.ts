import {
  ConflictException,
  NotFoundException,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { catchError, type Observable, throwError } from 'rxjs';

/**
 * The admin write paths check existence / duplicates first, but a concurrent request can still
 * win the race. Known Prisma errors become a clean 404 / 409 (generic text, no DB details)
 * instead of a 500. Anything else passes through to AllExceptionsFilter unchanged.
 */
export function mapPrismaError(err: unknown): unknown {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2025') return new NotFoundException('Record not found');
    if (err.code === 'P2002') return new ConflictException('Duplicate record');
    if (err.code === 'P2003') return new ConflictException('Related record conflict');
  }
  return err;
}

export class PrismaErrorsInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(catchError((err: unknown) => throwError(() => mapPrismaError(err))));
  }
}
