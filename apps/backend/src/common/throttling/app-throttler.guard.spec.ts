import type { ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerException, ThrottlerModule } from '@nestjs/throttler';
import { AppThrottlerGuard } from './app-throttler.guard';
import { RateLimit } from './rate-limit.decorator';
import { buildThrottlerOptions } from './throttler.config';

class FakeController {
  plain(): void {}
  @RateLimit('auth')
  login(): void {}
  @RateLimit('search')
  search(): void {}
}

@RateLimit('search')
class SearchOnlyController {
  any(): void {}
}

function context(cls: object, handler: (...args: never[]) => unknown, ip = '10.0.0.1') {
  const headers: Record<string, string> = {};
  const res = {
    header: (k: string, v: unknown) => (headers[k] = String(v)),
    setHeader: (k: string, v: unknown) => (headers[k] = String(v)),
  };
  const ctx = {
    getHandler: () => handler,
    getClass: () => cls,
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => ({ ip, headers: {} }), getResponse: () => res }),
  } as unknown as ExecutionContext;
  return { ctx, headers };
}

describe('AppThrottlerGuard', () => {
  let guard: AppThrottlerGuard;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot(
          buildThrottlerOptions({
            THROTTLE_DEFAULT_LIMIT: 4,
            THROTTLE_DEFAULT_TTL_SECONDS: 60,
            THROTTLE_AUTH_LIMIT: 2,
            THROTTLE_AUTH_TTL_SECONDS: 60,
            THROTTLE_SEARCH_LIMIT: 3,
            THROTTLE_SEARCH_TTL_SECONDS: 60,
            THROTTLE_EXPORT_LIMIT: 10,
            THROTTLE_EXPORT_TTL_SECONDS: 60,
          }),
        ),
      ],
      providers: [AppThrottlerGuard],
    }).compile();
    guard = moduleRef.get(AppThrottlerGuard);
    await guard.onModuleInit();
  });

  const hit = (cls: object, handler: (...args: never[]) => unknown, ip?: string) => {
    const { ctx, headers } = context(cls, handler, ip);
    return { result: guard.canActivate(ctx), headers };
  };

  it('applies only `default` to routes without @RateLimit', async () => {
    for (let i = 0; i < 4; i++) {
      await expect(hit(FakeController, FakeController.prototype.plain).result).resolves.toBe(true);
    }
    const { result, headers } = hit(FakeController, FakeController.prototype.plain);
    await expect(result).rejects.toBeInstanceOf(ThrottlerException);
    expect(Number(headers['Retry-After'])).toBeGreaterThan(0);
  });

  it('applies the opted-in `auth` throttler and sets a standard Retry-After', async () => {
    await expect(hit(FakeController, FakeController.prototype.login).result).resolves.toBe(true);
    await expect(hit(FakeController, FakeController.prototype.login).result).resolves.toBe(true);
    const { result, headers } = hit(FakeController, FakeController.prototype.login);
    await expect(result).rejects.toBeInstanceOf(ThrottlerException);
    expect(Number(headers['Retry-After'])).toBeGreaterThanOrEqual(1);
    expect(Number(headers['Retry-After'])).toBeLessThanOrEqual(60);
  });

  it('honours class-level @RateLimit (search: 3)', async () => {
    for (let i = 0; i < 3; i++) {
      await expect(
        hit(SearchOnlyController, SearchOnlyController.prototype.any).result,
      ).resolves.toBe(true);
    }
    await expect(
      hit(SearchOnlyController, SearchOnlyController.prototype.any).result,
    ).rejects.toBeInstanceOf(ThrottlerException);
  });

  it('tracks clients independently by IP', async () => {
    await hit(FakeController, FakeController.prototype.login, '1.1.1.1').result;
    await hit(FakeController, FakeController.prototype.login, '1.1.1.1').result;
    await expect(
      hit(FakeController, FakeController.prototype.login, '1.1.1.1').result,
    ).rejects.toBeInstanceOf(ThrottlerException);
    await expect(
      hit(FakeController, FakeController.prototype.login, '2.2.2.2').result,
    ).resolves.toBe(true);
  });

  it('counts `default` across routes for the same IP (global per-IP limit)', async () => {
    await hit(FakeController, FakeController.prototype.plain).result;
    await hit(FakeController, FakeController.prototype.search).result;
    await hit(FakeController, FakeController.prototype.login).result;
    await hit(FakeController, FakeController.prototype.plain).result;
    await expect(hit(FakeController, FakeController.prototype.plain).result).rejects.toBeInstanceOf(
      ThrottlerException,
    );
  });
});
