import {
  BCRYPT_COST,
  DEFAULT_ADMIN_EMAIL,
  DEFAULT_ADMIN_NAME,
  normalizeEmail,
  validateAdminSeedInput,
} from './admin-credentials';

describe('admin credentials rules', () => {
  it('uses bcrypt cost 12', () => {
    expect(BCRYPT_COST).toBe(12);
  });

  it('normalizes email (trim + lowercase)', () => {
    expect(normalizeEmail('  Admin@Example.COM ')).toBe('admin@example.com');
  });

  it('defaults to the initial admin account admin@quran.com / Admin', () => {
    expect(DEFAULT_ADMIN_EMAIL).toBe('admin@quran.com');
    expect(DEFAULT_ADMIN_NAME).toBe('Admin');
    expect(validateAdminSeedInput({ ADMIN_INITIAL_PASSWORD: 'correct horse battery' })).toEqual({
      ok: true,
      email: 'admin@quran.com',
      password: 'correct horse battery',
      name: 'Admin',
    });
  });

  it('accepts overrides and normalizes them', () => {
    expect(
      validateAdminSeedInput({
        ADMIN_EMAIL: ' Other@Example.com',
        ADMIN_INITIAL_PASSWORD: 'correct horse battery',
        ADMIN_NAME: '  Karim ',
      }),
    ).toEqual({
      ok: true,
      email: 'other@example.com',
      password: 'correct horse battery',
      name: 'Karim',
    });
    expect(
      validateAdminSeedInput({ ADMIN_INITIAL_PASSWORD: '123456789012', ADMIN_NAME: '  ' }),
    ).toMatchObject({ ok: true, name: null });
  });

  it('treats empty ADMIN_EMAIL / ADMIN_NAME (blank .env lines) as "use the default"', () => {
    expect(
      validateAdminSeedInput({
        ADMIN_EMAIL: '',
        ADMIN_NAME: '',
        ADMIN_INITIAL_PASSWORD: '123456789012',
      }),
    ).toMatchObject({ ok: true, email: 'admin@quran.com', name: 'Admin' });
  });

  it('ignores the old ADMIN_PASSWORD variable (only ADMIN_INITIAL_PASSWORD is read)', () => {
    expect(validateAdminSeedInput({ ADMIN_PASSWORD: 'correct horse battery' })).toEqual({
      ok: false,
      errors: ['ADMIN_INITIAL_PASSWORD is required'],
    });
  });

  it.each([
    [{}, ['ADMIN_INITIAL_PASSWORD is required']],
    [
      { ADMIN_EMAIL: 'nope', ADMIN_INITIAL_PASSWORD: '123456789012' },
      ['ADMIN_EMAIL must be a valid'],
    ],
    [
      { ADMIN_EMAIL: `${'a'.repeat(190)}@b.co`, ADMIN_INITIAL_PASSWORD: '123456789012' },
      ['ADMIN_EMAIL'],
    ],
    [{ ADMIN_INITIAL_PASSWORD: '12345678901' }, ['at least 12 characters']],
    [{ ADMIN_INITIAL_PASSWORD: 'x'.repeat(73) }, ['at most 72 bytes']],
    [{ ADMIN_INITIAL_PASSWORD: 'x'.repeat(20), ADMIN_NAME: 'n'.repeat(101) }, ['ADMIN_NAME']],
  ])('rejects %p', (env, expected) => {
    const result = validateAdminSeedInput(env);
    expect(result.ok).toBe(false);
    const errors = result.ok ? [] : result.errors;
    expected.forEach((e, i) => expect(errors[i]).toContain(e));
  });

  it('counts characters, not bytes, for the minimum; bytes for the bcrypt maximum', () => {
    const arabic12 = String.fromCodePoint(0x0628).repeat(12); // 12 chars, 24 bytes
    expect(validateAdminSeedInput({ ADMIN_INITIAL_PASSWORD: arabic12 }).ok).toBe(true);
    const arabic37 = String.fromCodePoint(0x0628).repeat(37); // 74 bytes
    expect(validateAdminSeedInput({ ADMIN_INITIAL_PASSWORD: arabic37 }).ok).toBe(false);
  });

  it('never includes the password in error messages', () => {
    const secret = 'shortsecret';
    const result = validateAdminSeedInput({ ADMIN_INITIAL_PASSWORD: secret });
    expect(JSON.stringify(result)).not.toContain(secret);
  });
});
