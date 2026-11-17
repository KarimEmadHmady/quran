import type { ThrottlerModuleOptions, ThrottlerOptions } from '@nestjs/throttler';
import type { EnvVars } from '../../config/env.validation';

/** Named throttlers. `default` applies to every route; the others are opt-in via @RateLimit(). */
export const THROTTLER = {
  DEFAULT: 'default',
  AUTH: 'auth',
  SEARCH: 'search',
  EXPORT: 'export',
} as const;

export type OptInThrottlerName =
  typeof THROTTLER.AUTH | typeof THROTTLER.SEARCH | typeof THROTTLER.EXPORT;

/**
 * Keys a counter by throttler name + client only (not by route), so each limit is
 * "N requests per window per IP" across all routes it applies to.
 * The tracker is the client IP (req.ip), which honours the TRUST_PROXY setting.
 */
export function throttleKey(_context: unknown, tracker: string, throttlerName: string): string {
  return `${throttlerName}:${tracker}`;
}

type ThrottleEnv = Pick<
  EnvVars,
  | 'THROTTLE_DEFAULT_LIMIT'
  | 'THROTTLE_DEFAULT_TTL_SECONDS'
  | 'THROTTLE_AUTH_LIMIT'
  | 'THROTTLE_AUTH_TTL_SECONDS'
  | 'THROTTLE_SEARCH_LIMIT'
  | 'THROTTLE_SEARCH_TTL_SECONDS'
  | 'THROTTLE_EXPORT_LIMIT'
  | 'THROTTLE_EXPORT_TTL_SECONDS'
>;

export function buildThrottlerOptions(env: ThrottleEnv): ThrottlerModuleOptions {
  const throttler = (name: string, limit: number, ttlSeconds: number): ThrottlerOptions => ({
    name,
    limit,
    ttl: ttlSeconds * 1000,
    generateKey: throttleKey,
  });
  return {
    errorMessage: 'Too many requests, please try again later.',
    throttlers: [
      throttler(THROTTLER.DEFAULT, env.THROTTLE_DEFAULT_LIMIT, env.THROTTLE_DEFAULT_TTL_SECONDS),
      throttler(THROTTLER.AUTH, env.THROTTLE_AUTH_LIMIT, env.THROTTLE_AUTH_TTL_SECONDS),
      throttler(THROTTLER.SEARCH, env.THROTTLE_SEARCH_LIMIT, env.THROTTLE_SEARCH_TTL_SECONDS),
      throttler(THROTTLER.EXPORT, env.THROTTLE_EXPORT_LIMIT, env.THROTTLE_EXPORT_TTL_SECONDS),
    ],
  };
}
