import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hashSync } from 'bcryptjs';
import type { PrismaService } from '../../prisma/prisma.service';
import { DUMMY_PASSWORD_HASH, INVALID_CREDENTIALS_MESSAGE } from './auth.constants';
import { AuthService, LoginLockedException } from './auth.service';
import { InMemoryLockoutStore, LoginLockoutService } from './login-lockout';

// Wrap the real compare so calls can be asserted while behaviour stays real.
jest.mock('bcryptjs', () => {
  const actual = jest.requireActual<typeof import('bcryptjs')>('bcryptjs');
  return { ...actual, compare: jest.fn((s: string, hash: string) => actual.compare(s, hash)) };
});

const PASSWORD = 'correct horse battery staple';
const HASH = hashSync(PASSWORD, 4); // low cost keeps unit tests fast; production uses 12
const ADMIN = { id: 7, email: 'admin@example.com', name: 'Admin', passwordHash: HASH };

function setup(found: typeof ADMIN | null = ADMIN) {
  const prisma = {
    admin: {
      findUnique: jest.fn().mockResolvedValue(found),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const jwt = new JwtService({ secret: 'unit-test-secret-unit-test-secret' });
  const lockout = new LoginLockoutService(new InMemoryLockoutStore(), () => Date.now());
  const service = new AuthService(prisma as unknown as PrismaService, jwt, lockout);
  return { prisma, jwt, lockout, service };
}

async function failure(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (e) {
    return e;
  }
  throw new Error('expected a rejection');
}

describe('AuthService.login', () => {
  afterEach(() => jest.mocked(compare).mockClear());

  it('succeeds: normalizes email, updates last_login_at, signs a JWT with sub = id', async () => {
    const { prisma, jwt, service } = setup();
    const res = await service.login('  Admin@Example.com ', PASSWORD);

    expect(prisma.admin.findUnique).toHaveBeenCalledWith({
      where: { email: 'admin@example.com' },
      select: { id: true, email: true, name: true, passwordHash: true },
    });
    expect(prisma.admin.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { lastLoginAt: expect.any(Date) as Date },
    });
    expect(res.admin).toEqual({ id: 7, email: 'admin@example.com', name: 'Admin' });
    expect(res.admin).not.toHaveProperty('passwordHash');
    expect(jwt.verify<{ sub: string }>(res.token).sub).toBe('7');
  });

  it('wrong password and unknown email throw the identical 401', async () => {
    const wrong = await failure(setup().service.login(ADMIN.email, 'wrong password'));
    const unknown = await failure(setup(null).service.login('nobody@example.com', PASSWORD));
    for (const e of [wrong, unknown]) {
      expect(e).toBeInstanceOf(UnauthorizedException);
      expect((e as UnauthorizedException).getResponse()).toEqual(
        new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE).getResponse(),
      );
    }
  });

  it('runs bcrypt against a dummy cost-12 hash when the email is unknown (timing)', async () => {
    const { service } = setup(null);
    await failure(service.login('nobody@example.com', PASSWORD));
    expect(jest.mocked(compare)).toHaveBeenCalledWith(PASSWORD, DUMMY_PASSWORD_HASH);
  });

  it('does not update last_login_at on failure', async () => {
    const { prisma, service } = setup();
    await failure(service.login(ADMIN.email, 'wrong password'));
    expect(prisma.admin.update).not.toHaveBeenCalled();
  });

  it('5 failures lock the email: the 6th attempt is 429 even with the right password', async () => {
    const { prisma, service } = setup();
    for (let i = 0; i < 5; i++) {
      expect(await failure(service.login(ADMIN.email, 'wrong'))).toBeInstanceOf(
        UnauthorizedException,
      );
    }
    const sixth = await failure(service.login(ADMIN.email, PASSWORD));
    expect(sixth).toBeInstanceOf(LoginLockedException);
    expect((sixth as LoginLockedException).getStatus()).toBe(429);
    expect((sixth as LoginLockedException).retryAfterSeconds).toBe(900);
    expect(prisma.admin.findUnique).toHaveBeenCalledTimes(5); // locked: no DB/bcrypt work
    expect(jest.mocked(compare)).toHaveBeenCalledTimes(5);
  });

  it('locks unknown emails too (same behaviour, no enumeration)', async () => {
    const { service } = setup(null);
    for (let i = 0; i < 5; i++) await failure(service.login('ghost@example.com', 'x'));
    expect(await failure(service.login('ghost@example.com', 'x'))).toBeInstanceOf(
      LoginLockedException,
    );
  });

  it('the lockout key is case-insensitive', async () => {
    const { service } = setup();
    for (let i = 0; i < 5; i++) await failure(service.login(`ADMIN@example.com`, 'wrong'));
    expect(await failure(service.login('admin@EXAMPLE.com', PASSWORD))).toBeInstanceOf(
      LoginLockedException,
    );
  });

  it('a success resets the failure count', async () => {
    const { service } = setup();
    for (let i = 0; i < 4; i++) await failure(service.login(ADMIN.email, 'wrong'));
    await service.login(ADMIN.email, PASSWORD);
    for (let i = 0; i < 4; i++) await failure(service.login(ADMIN.email, 'wrong'));
    await expect(service.login(ADMIN.email, PASSWORD)).resolves.toBeDefined();
  });
});

describe('AuthService.me', () => {
  it('returns the profile without the password hash', async () => {
    const { prisma, service } = setup();
    const profile = {
      id: 7,
      email: 'a@b.co',
      name: null,
      createdAt: new Date(),
      lastLoginAt: null,
    };
    prisma.admin.findUnique.mockResolvedValue(profile);
    await expect(service.me(7)).resolves.toEqual(profile);
    expect(prisma.admin.findUnique).toHaveBeenCalledWith({
      where: { id: 7 },
      select: { id: true, email: true, name: true, createdAt: true, lastLoginAt: true },
    });
  });

  it('401 when the admin no longer exists', async () => {
    const { service } = setup(null);
    await expect(service.me(7)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
