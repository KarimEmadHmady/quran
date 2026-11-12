import type { CookieOptions } from 'express';

export const ADMIN_SESSION_COOKIE = 'qa_admin_session';
/** The cookie is only sent to /admin/* routes, never to public endpoints. */
export const ADMIN_COOKIE_PATH = '/admin';

export const JWT_ISSUER = 'quran-app';
export const JWT_AUDIENCE = 'quran-admin';

/** Same message for unknown email and wrong password. */
export const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password';
export const LOCKED_MESSAGE = 'Too many failed login attempts. Please try again later.';

/**
 * bcrypt (cost 12) hash of a random value nobody knows. Compared against when the email does not
 * exist, so unknown-email and wrong-password requests take the same time.
 */
export const DUMMY_PASSWORD_HASH = '$2b$12$gJy8IVQB9fwLSEyP2bbZAeKiacH8jg47Amcn4/.XXGc8lrxXClfmu';

export function sessionCookieOptions(isProduction: boolean, maxAgeSeconds: number): CookieOptions {
  return { ...clearSessionCookieOptions(isProduction), maxAge: maxAgeSeconds * 1000 };
}

/** Must match the attributes used when setting the cookie, or browsers keep it. */
export function clearSessionCookieOptions(isProduction: boolean): CookieOptions {
  return { httpOnly: true, secure: isProduction, sameSite: 'lax', path: ADMIN_COOKIE_PATH };
}
