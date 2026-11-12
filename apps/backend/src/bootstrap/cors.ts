import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/**
 * Strict CORS: only the exact configured origins get CORS headers. Other origins get no
 * Access-Control-Allow-Origin header (the browser blocks them); the request is not errored,
 * so same-origin and non-browser clients (curl, server-to-server) are unaffected.
 * Credentials are allowed for the admin JWT cookie (Step 7).
 */
export function buildCorsOptions(allowedOrigins: readonly string[]): CorsOptions {
  const allowed = new Set(allowedOrigins);
  return {
    origin: (origin, callback) => callback(null, origin !== undefined && allowed.has(origin)),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'Retry-After'],
    maxAge: 600,
  };
}
