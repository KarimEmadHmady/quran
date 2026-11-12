import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

// Accept a caller/proxy supplied id only if it is short and plain, so it is safe to log
// (no spaces, control characters or log-injection payloads). Otherwise generate one.
const SAFE_ID = /^[A-Za-z0-9._-]{8,128}$/;

export function isSafeRequestId(value: unknown): value is string {
  return typeof value === 'string' && SAFE_ID.test(value);
}

/**
 * Ensures every request has an id: reuses a safe incoming `x-request-id`, else a new UUID.
 * The id is written back onto the request headers (single source of truth for later code)
 * and returned to the client in the `X-Request-Id` response header.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const id = isSafeRequestId(incoming) ? incoming : randomUUID();
  req.headers[REQUEST_ID_HEADER] = id;
  res.setHeader('X-Request-Id', id);
  next();
}

export function getRequestId(req: Pick<Request, 'headers'>): string | undefined {
  const value = req.headers[REQUEST_ID_HEADER];
  return isSafeRequestId(value) ? value : undefined;
}
