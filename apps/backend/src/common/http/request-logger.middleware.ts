import { Logger } from '@nestjs/common';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { pathOnly } from './error-body';
import { getRequestId } from './request-id.middleware';

const MAX_LOGGED_PATH = 200;

/**
 * Builds the single access-log line. Deliberately logs ONLY: method, path (no query string),
 * status, duration and request id. Never bodies, headers, cookies, tokens or query values.
 */
export function formatAccessLog(args: {
  method: string;
  originalUrl: string;
  status: number;
  durationMs: number;
  requestId: string | undefined;
}): string {
  let path = pathOnly(args.originalUrl).replace(/[^ -~]/g, '?'); // printable ASCII only
  if (path.length > MAX_LOGGED_PATH) path = `${path.slice(0, MAX_LOGGED_PATH)}...`;
  return `${args.method} ${path} ${args.status} ${args.durationMs.toFixed(1)}ms rid=${args.requestId ?? '-'}`;
}

/** Express middleware: logs one line per request when the response finishes. */
export function createRequestLogger(logger: Logger = new Logger('HTTP')): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      const line = formatAccessLog({
        method: req.method,
        originalUrl: req.originalUrl,
        status: res.statusCode,
        durationMs,
        requestId: getRequestId(req),
      });
      if (res.statusCode >= 500) logger.error(line);
      else if (res.statusCode >= 400) logger.warn(line);
      else logger.log(line);
    });
    next();
  };
}
