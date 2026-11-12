import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { ThrottlerLimitDetail, ThrottlerRequest } from '@nestjs/throttler';
import type { Response } from 'express';
import { RATE_LIMIT_KEY } from './rate-limit.decorator';
import { THROTTLER } from './throttler.config';

/**
 * Global rate-limit guard.
 * - `default` throttler applies to every route.
 * - Other named throttlers (auth, search) apply ONLY where opted in with @RateLimit(...).
 *   (Stock ThrottlerGuard would apply every named throttler to every route.)
 * - On 429 always sets a standard `Retry-After` header in seconds. (Stock guard only does
 *   that for `default`; for named throttlers it uses `Retry-After-<name>`.)
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected override async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    const name = requestProps.throttler.name ?? THROTTLER.DEFAULT;
    if (name !== THROTTLER.DEFAULT && !this.isOptedIn(requestProps.context, name)) {
      return true;
    }
    return super.handleRequest(requestProps);
  }

  protected override async throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const res = context.switchToHttp().getResponse<Response>();
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil(detail.timeToBlockExpire))));
    await super.throwThrottlingException(context, detail);
  }

  private isOptedIn(context: ExecutionContext, name: string): boolean {
    const names = this.reflector.getAllAndMerge<string[]>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    return names.includes(name);
  }
}
