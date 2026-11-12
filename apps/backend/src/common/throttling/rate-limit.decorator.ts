import { SetMetadata } from '@nestjs/common';
import type { OptInThrottlerName } from './throttler.config';

export const RATE_LIMIT_KEY = 'rateLimit:optIn';

/**
 * Opts a controller or handler into extra named throttlers on top of `default`.
 *   @RateLimit('auth')    -> login (5/min/IP)
 *   @RateLimit('search')  -> search (30/min/IP)
 */
export const RateLimit = (...names: OptInThrottlerName[]) => SetMetadata(RATE_LIMIT_KEY, names);
