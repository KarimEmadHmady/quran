import { compare, getRounds } from 'bcryptjs';
import {
  ADMIN_COOKIE_PATH,
  clearSessionCookieOptions,
  DUMMY_PASSWORD_HASH,
  sessionCookieOptions,
} from './auth.constants';

describe('auth constants', () => {
  it('session cookie: httpOnly, SameSite=Lax, path /admin, Secure only in production', () => {
    expect(sessionCookieOptions(false, 3600)).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: ADMIN_COOKIE_PATH,
      maxAge: 3_600_000,
    });
    expect(sessionCookieOptions(true, 60).secure).toBe(true);
  });

  it('clear options match the set options (minus maxAge)', () => {
    const { maxAge: _maxAge, ...rest } = sessionCookieOptions(true, 60);
    void _maxAge;
    expect(clearSessionCookieOptions(true)).toEqual(rest);
  });

  it('the dummy hash is a valid cost-12 bcrypt hash that matches nothing obvious', async () => {
    expect(getRounds(DUMMY_PASSWORD_HASH)).toBe(12);
    await expect(compare('', DUMMY_PASSWORD_HASH)).resolves.toBe(false);
    await expect(compare('password', DUMMY_PASSWORD_HASH)).resolves.toBe(false);
  });
});
