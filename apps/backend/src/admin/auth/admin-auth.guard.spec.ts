import { Controller, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import {
  AdminAuthGuard,
  isAdminControllerPath,
  PublicAdminRoute,
  type AdminRequest,
} from './admin-auth.guard';
import { ADMIN_SESSION_COOKIE } from './auth.constants';

const SECRET = 'guard-test-secret-guard-test-secret';
const opts = { issuer: 'quran-app', audience: 'quran-admin' };
const jwt = new JwtService({
  secret: SECRET,
  signOptions: { algorithm: 'HS256', expiresIn: 60, ...opts },
  verifyOptions: { algorithms: ['HS256'], ...opts },
});

@Controller('admin/things')
class AdminThings {
  list() {}
  @PublicAdminRoute()
  open() {}
}

@Controller('ADMIN')
class AdminUpper {
  list() {}
}

@Controller('suras')
class PublicThings {
  list() {}
}

function ctx(cls: object, handler: () => void, cookies?: Record<string, string>, type = 'http') {
  const req = { cookies } as AdminRequest;
  const context = {
    getType: () => type,
    getClass: () => cls,
    getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { context, req };
}

describe('isAdminControllerPath', () => {
  it.each([
    ['admin', true],
    ['/admin/auth', true],
    ['Admin/x', true],
    [['x', 'admin/y'], true],
    ['administrator', false],
    ['suras', false],
    [undefined, false],
    [[1], false],
  ])('%p -> %p', (path, expected) => {
    expect(isAdminControllerPath(path)).toBe(expected);
  });
});

describe('AdminAuthGuard', () => {
  const guard = new AdminAuthGuard(new Reflector(), jwt);
  const token = (payload: object, options = {}) => jwt.sign(payload, options);

  it('ignores non-admin controllers and non-http contexts', async () => {
    await expect(
      guard.canActivate(ctx(PublicThings, PublicThings.prototype.list).context),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(ctx(AdminThings, AdminThings.prototype.list, undefined, 'rpc').context),
    ).resolves.toBe(true);
  });

  it('allows @PublicAdminRoute() handlers without a cookie', async () => {
    await expect(
      guard.canActivate(ctx(AdminThings, AdminThings.prototype.open).context),
    ).resolves.toBe(true);
  });

  it('401 without a cookie, also for differently-cased controller paths', async () => {
    for (const [cls, handler] of [
      [AdminThings, AdminThings.prototype.list],
      [AdminUpper, AdminUpper.prototype.list],
    ] as const) {
      await expect(guard.canActivate(ctx(cls, handler).context)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      await expect(
        guard.canActivate(ctx(cls, handler, { [ADMIN_SESSION_COOKIE]: '' }).context),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    }
  });

  it('accepts a valid token and attaches req.admin', async () => {
    const { context, req } = ctx(AdminThings, AdminThings.prototype.list, {
      [ADMIN_SESSION_COOKIE]: token({ sub: '42' }),
    });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(req.admin).toEqual({ id: 42 });
  });

  it.each([
    ['garbage', () => 'not.a.jwt'],
    ['wrong secret', () => new JwtService({ secret: 'x'.repeat(40) }).sign({ sub: '1' }, opts)],
    ['expired', () => token({ sub: '1' }, { expiresIn: -10 })],
    ['wrong audience', () => token({ sub: '1' }, { audience: 'other' })],
    [
      'alg none',
      () =>
        `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from('{"sub":"1","iss":"quran-app","aud":"quran-admin"}').toString('base64url')}.`,
    ],
    ['missing sub', () => token({})],
    ['non-numeric sub', () => token({ sub: 'abc' })],
    ['zero sub', () => token({ sub: '0' })],
  ])('401 for %s', async (_label, make) => {
    const { context } = ctx(AdminThings, AdminThings.prototype.list, {
      [ADMIN_SESSION_COOKIE]: make(),
    });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
