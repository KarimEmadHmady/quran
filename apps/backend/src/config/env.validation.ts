import * as Joi from 'joi';
import { parseDurationSeconds } from './duration';
import { parseOrigins } from './origins';
import { parseTrustProxy, type TrustProxySetting } from './trust-proxy';

export type NodeEnv = 'development' | 'test' | 'production';

export interface EnvVars {
  NODE_ENV: NodeEnv;
  PORT: number;
  DATABASE_URL: string;
  /** Allowed browser origins for CORS (comma-separated in env, parsed to a list). */
  WEB_ORIGIN: string[];
  /** Express "trust proxy" setting; see trust-proxy.ts. */
  TRUST_PROXY: TrustProxySetting;
  /** Max JSON body size, body-parser syntax (e.g. "100kb"). */
  BODY_LIMIT: string;
  /** Max length of the request URL (path + query string), in characters. */
  MAX_URL_LENGTH: number;
  THROTTLE_DEFAULT_LIMIT: number;
  THROTTLE_DEFAULT_TTL_SECONDS: number;
  THROTTLE_AUTH_LIMIT: number;
  THROTTLE_AUTH_TTL_SECONDS: number;
  THROTTLE_SEARCH_LIMIT: number;
  THROTTLE_SEARCH_TTL_SECONDS: number;
  /** HS256 secret for admin session JWTs (min 32 chars). */
  JWT_SECRET: string;
  /** Admin session lifetime in seconds (env: duration like "8h"; 5m..7d). */
  JWT_EXPIRES_IN: number;
}

const positiveInt = (def: number) => Joi.number().integer().min(1).max(1_000_000).default(def);

export const envSchema = Joi.object<EnvVars>({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(3001),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['mysql'] })
    .required(),
  WEB_ORIGIN: Joi.string()
    .required()
    .custom((value: string, helpers) => {
      const origins = parseOrigins(value);
      return origins ?? helpers.error('any.invalid');
    })
    .messages({
      'any.invalid':
        '"WEB_ORIGIN" must be a comma-separated list of origins like https://example.com (scheme + host [+ port], no path)',
    }),
  TRUST_PROXY: Joi.string()
    .allow('')
    // Joi does not run .custom() on defaults, so the default must already be the parsed value.
    .default(false)
    .custom((value: string, helpers) => {
      const parsed = parseTrustProxy(value);
      return parsed === undefined ? helpers.error('any.invalid') : parsed;
    })
    .messages({
      'any.invalid':
        '"TRUST_PROXY" must be "false", "true", a hop count (e.g. 1), or a comma-separated list of IPs/CIDRs/loopback/linklocal/uniquelocal',
    }),
  BODY_LIMIT: Joi.string()
    .pattern(/^[0-9]{1,6}(b|kb|mb)$/)
    .default('100kb')
    .messages({ 'string.pattern.base': '"BODY_LIMIT" must look like 100kb, 1mb or 512b' }),
  MAX_URL_LENGTH: Joi.number().integer().min(256).max(65536).default(8192),
  THROTTLE_DEFAULT_LIMIT: positiveInt(100),
  THROTTLE_DEFAULT_TTL_SECONDS: positiveInt(60),
  THROTTLE_AUTH_LIMIT: positiveInt(5),
  THROTTLE_AUTH_TTL_SECONDS: positiveInt(60),
  THROTTLE_SEARCH_LIMIT: positiveInt(30),
  THROTTLE_SEARCH_TTL_SECONDS: positiveInt(60),
  JWT_SECRET: Joi.string().min(32).max(512).required().messages({
    'string.min': '"JWT_SECRET" must be at least 32 characters (use a long random value)',
  }),
  JWT_EXPIRES_IN: Joi.string()
    .default(8 * 3600) // already parsed: Joi does not run .custom() on defaults
    .custom((value: string, helpers) => {
      return parseDurationSeconds(value, 5 * 60, 7 * 86_400) ?? helpers.error('any.invalid');
    })
    .messages({
      'any.invalid': '"JWT_EXPIRES_IN" must be a duration like 15m, 8h or 1d (between 5m and 7d)',
    }),
});

/**
 * Validates process env at startup. Throws one error listing every problem.
 * Messages name the variable and the rule only; values are never echoed,
 * so secrets (e.g. the DB password inside DATABASE_URL) cannot leak to logs.
 */
export function validateEnv(config: Record<string, unknown>): EnvVars {
  const result = envSchema.validate(config, {
    abortEarly: false,
    allowUnknown: true,
    convert: true,
  });
  if (result.error) {
    const problems = result.error.details.map((d) => `  - ${d.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return result.value;
}
