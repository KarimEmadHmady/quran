import { validateEnv } from './env.validation';

const VALID_URL = 'mysql://user:s3cret-pass@localhost:3306/db';
const SECRET = 'x'.repeat(32);
const BASE = { DATABASE_URL: VALID_URL, WEB_ORIGIN: 'http://localhost:3000', JWT_SECRET: SECRET };

describe('validateEnv', () => {
  it('accepts a minimal valid config and applies every default', () => {
    expect(validateEnv(BASE)).toEqual({
      NODE_ENV: 'development',
      PORT: 3001,
      DATABASE_URL: VALID_URL,
      WEB_ORIGIN: ['http://localhost:3000'],
      TRUST_PROXY: false,
      BODY_LIMIT: '100kb',
      MAX_URL_LENGTH: 8192,
      THROTTLE_DEFAULT_LIMIT: 100,
      THROTTLE_DEFAULT_TTL_SECONDS: 60,
      THROTTLE_AUTH_LIMIT: 5,
      THROTTLE_AUTH_TTL_SECONDS: 60,
      THROTTLE_SEARCH_LIMIT: 30,
      THROTTLE_SEARCH_TTL_SECONDS: 60,
      JWT_SECRET: SECRET,
      JWT_EXPIRES_IN: 28_800,
    });
  });

  it('coerces numeric strings', () => {
    const env = validateEnv({ ...BASE, PORT: '4000', THROTTLE_AUTH_LIMIT: '3' });
    expect(env.PORT).toBe(4000);
    expect(env.THROTTLE_AUTH_LIMIT).toBe(3);
  });

  it('parses WEB_ORIGIN lists and TRUST_PROXY hop counts', () => {
    const env = validateEnv({
      ...BASE,
      WEB_ORIGIN: 'https://quran.example, http://localhost:3000',
      TRUST_PROXY: '1',
    });
    expect(env.WEB_ORIGIN).toEqual(['https://quran.example', 'http://localhost:3000']);
    expect(env.TRUST_PROXY).toBe(1);
  });

  it('fails fast when required variables are missing, listing all of them', () => {
    expect(() => validateEnv({})).toThrow(
      /DATABASE_URL" is required[\s\S]*WEB_ORIGIN" is required/,
    );
  });

  it.each([
    ['DATABASE_URL', { DATABASE_URL: 'postgres://u:p@h/db' }],
    ['WEB_ORIGIN', { WEB_ORIGIN: 'http://localhost:3000/' }],
    ['WEB_ORIGIN', { WEB_ORIGIN: 'ftp://files.example' }],
    ['TRUST_PROXY', { TRUST_PROXY: 'everyone' }],
    ['BODY_LIMIT', { BODY_LIMIT: '10gb' }],
    ['MAX_URL_LENGTH', { MAX_URL_LENGTH: '10' }],
    ['THROTTLE_DEFAULT_LIMIT', { THROTTLE_DEFAULT_LIMIT: '0' }],
    ['NODE_ENV', { NODE_ENV: 'staging' }],
    ['PORT', { PORT: '70000' }],
  ])('rejects an invalid %s', (name, override) => {
    expect(() => validateEnv({ ...BASE, ...override })).toThrow(new RegExp(name));
  });

  it('never echoes secret values in the error message', () => {
    const secret = 'ultra-secret-password-123';
    try {
      validateEnv({ DATABASE_URL: `postgres://root:${secret}@localhost/db`, PORT: 'abc' });
      fail('expected validateEnv to throw');
    } catch (e) {
      expect((e as Error).message).not.toContain(secret);
    }
  });

  it('parses JWT_EXPIRES_IN and validates JWT_SECRET without echoing it', () => {
    expect(validateEnv({ ...BASE, JWT_EXPIRES_IN: '15m' }).JWT_EXPIRES_IN).toBe(900);
    expect(() => validateEnv({ ...BASE, JWT_EXPIRES_IN: '30d' })).toThrow(/JWT_EXPIRES_IN/);
    expect(() => validateEnv({ ...BASE, JWT_EXPIRES_IN: 'soon' })).toThrow(/JWT_EXPIRES_IN/);
    expect(() => validateEnv({ ...BASE, JWT_SECRET: 'short-secret-value' })).toThrow(
      /JWT_SECRET" must be at least 32/,
    );
    try {
      validateEnv({ ...BASE, JWT_SECRET: 'short-secret-value' });
    } catch (e) {
      expect(String(e)).not.toContain('short-secret-value');
    }
    const { JWT_SECRET: _omit, ...withoutSecret } = BASE;
    void _omit;
    expect(() => validateEnv(withoutSecret)).toThrow(/JWT_SECRET/);
  });
});
