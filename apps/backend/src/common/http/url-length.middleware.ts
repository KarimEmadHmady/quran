import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { buildErrorBody } from './error-body';

/**
 * Rejects requests whose URL (path + query string) is longer than `maxLength` with 414.
 * Runs before routing, so it answers directly with the shared error shape.
 * Fine-grained limits (e.g. search query <= 200 chars) live in the DTOs.
 */
export function createUrlLengthGuard(maxLength: number): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.originalUrl.length > maxLength) {
      res.status(414).json(
        buildErrorBody({
          status: 414,
          message: `URL must be at most ${maxLength} characters`,
          req,
        }),
      );
      return;
    }
    next();
  };
}
