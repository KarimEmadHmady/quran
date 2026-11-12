import { STATUS_CODES } from 'node:http';
import type { Request } from 'express';
import { getRequestId } from './request-id.middleware';

/** The ONE error shape every error response uses (filter + pre-routing middleware). */
export interface ErrorBody {
  statusCode: number;
  /** HTTP reason phrase, e.g. "Bad Request". */
  error: string;
  message: string;
  /** Per-field problems (validation errors). */
  details?: string[];
  requestId?: string;
  /** Path only. The query string is never echoed (it may contain user data). */
  path: string;
  timestamp: string;
}

export function pathOnly(originalUrl: string): string {
  const q = originalUrl.indexOf('?');
  return q === -1 ? originalUrl : originalUrl.slice(0, q);
}

export function reasonPhrase(status: number): string {
  return STATUS_CODES[status] ?? 'Error';
}

export function buildErrorBody(args: {
  status: number;
  message: string;
  details?: string[];
  req: Pick<Request, 'originalUrl' | 'url' | 'headers'>;
  now?: Date;
}): ErrorBody {
  const { status, message, details, req } = args;
  const body: ErrorBody = {
    statusCode: status,
    error: reasonPhrase(status),
    message,
    path: pathOnly(req.originalUrl ?? req.url ?? ''),
    timestamp: (args.now ?? new Date()).toISOString(),
  };
  if (details && details.length > 0) body.details = details;
  const requestId = getRequestId(req);
  if (requestId) body.requestId = requestId;
  return body;
}
