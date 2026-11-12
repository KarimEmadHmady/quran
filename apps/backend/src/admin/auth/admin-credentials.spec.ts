import { BCRYPT_COST, normalizeEmail, validateAdminSeedInput } from './admin-credentials';

describe('admin credentials rules', () => {
  it('uses bcrypt cost 12', () => {
    expect(BCRYPT_COST).toBe(12);
  });

  it('normalizes email (trim + lowercase)', () => {
    expect(normalizeEmail('  Admin@Example.COM ')).toBe('admin@example.com');
  });

  it('accepts valid input and normalizes it', () => {
    expect(
      validateAdminSeedInput({
        ADMIN_EMAIL: ' Admin@Example.com',
        ADMIN_PASSWORD: 'correct horse battery',
        ADMIN_NAME: '  Karim ',
      }),
    ).toEqual({
      ok: true,
      email: 'admin@example.com',
      password: 'correct horse battery',
      name: 'Karim',
    });
    const noName = validateAdminSeedInput({
      ADMIN_EMAIL: 'a@b.co',
      ADMIN_PASSWORD: '123456789012',
    });
    expect(noName).toMatchObject({ ok: true, name: null });
  });

  it.each([
    [{}, ['ADMIN_EMAIL is required', 'ADMIN_PASSWORD is required']],
    [{ ADMIN_EMAIL: 'nope', ADMIN_PASSWORD: '123456789012' }, ['ADMIN_EMAIL must be a valid']],
    [{ ADMIN_EMAIL: `${'a'.repeat(190)}@b.co`, ADMIN_PASSWORD: '123456789012' }, ['ADMIN_EMAIL']],
    [{ ADMIN_EMAIL: 'a@b.co', ADMIN_PASSWORD: '12345678901' }, ['at least 12 characters']],
    [{ ADMIN_EMAIL: 'a@b.co', ADMIN_PASSWORD: 'x'.repeat(73) }, ['at most 72 bytes']],
    [
      { ADMIN_EMAIL: 'a@b.co', ADMIN_PASSWORD: 'x'.repeat(20), ADMIN_NAME: 'n'.repeat(101) },
      ['ADMIN_NAME'],
    ],
  ])('rejects %p', (env, expected) => {
    const result = validateAdminSeedInput(env);
    expect(result.ok).toBe(false);
    const errors = result.ok ? [] : result.errors;
    expected.forEach((e, i) => expect(errors[i]).toContain(e));
  });

  it('counts characters, not bytes, for the minimum; bytes for the bcrypt maximum', () => {
    const arabic12 = String.fromCodePoint(0x0628).repeat(12); // 12 chars, 24 bytes
    expect(validateAdminSeedInput({ ADMIN_EMAIL: 'a@b.co', ADMIN_PASSWORD: arabic12 }).ok).toBe(
      true,
    );
    const arabic37 = String.fromCodePoint(0x0628).repeat(37); // 74 bytes
    expect(validateAdminSeedInput({ ADMIN_EMAIL: 'a@b.co', ADMIN_PASSWORD: arabic37 }).ok).toBe(
      false,
    );
  });

  it('never includes the password in error messages', () => {
    const secret = 'shortsecret';
    const result = validateAdminSeedInput({ ADMIN_EMAIL: 'a@b.co', ADMIN_PASSWORD: secret });
    expect(JSON.stringify(result)).not.toContain(secret);
  });
});
