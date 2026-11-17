// Pure credential rules shared by the API and scripts/seed-admin.ts.
// Keep this file free of imports and non-erasable TypeScript: the seed script runs it directly
// with Node's built-in type stripping.

export const BCRYPT_COST = 12;
export const PASSWORD_MIN_LENGTH = 12;
/** bcrypt silently ignores everything after 72 bytes, so longer seed passwords are refused. */
export const PASSWORD_MAX_BYTES = 72;
/** admins.email is VARCHAR(190). */
export const EMAIL_MAX_LENGTH = 190;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export type SeedInput =
  | { ok: true; email: string; password: string; name: string | null }
  | { ok: false; errors: string[] };

/** The initial admin account (Phase 6): overridable with ADMIN_EMAIL / ADMIN_NAME. */
export const DEFAULT_ADMIN_EMAIL = 'admin@quran.com';
export const DEFAULT_ADMIN_NAME = 'Admin';

/**
 * Validates the seed input: ADMIN_INITIAL_PASSWORD (required, never stored or printed),
 * ADMIN_EMAIL (default admin@quran.com), ADMIN_NAME (default Admin).
 * Error messages never include values.
 */
export function validateAdminSeedInput(env: Record<string, string | undefined>): SeedInput {
  const errors: string[] = [];
  const email = normalizeEmail(env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL);
  const password = env.ADMIN_INITIAL_PASSWORD ?? '';
  const name = (env.ADMIN_NAME || DEFAULT_ADMIN_NAME).trim();

  if (!EMAIL.test(email) || email.length > EMAIL_MAX_LENGTH) {
    errors.push(`ADMIN_EMAIL must be a valid email address (max ${EMAIL_MAX_LENGTH} chars)`);
  }

  if (!password) errors.push('ADMIN_INITIAL_PASSWORD is required');
  else if ([...password].length < PASSWORD_MIN_LENGTH) {
    errors.push(`ADMIN_INITIAL_PASSWORD must be at least ${PASSWORD_MIN_LENGTH} characters`);
  } else if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) {
    errors.push(
      `ADMIN_INITIAL_PASSWORD must be at most ${PASSWORD_MAX_BYTES} bytes (bcrypt limit)`,
    );
  }

  if (name.length > 100) errors.push('ADMIN_NAME must be at most 100 characters');

  return errors.length ? { ok: false, errors } : { ok: true, email, password, name: name || null };
}
