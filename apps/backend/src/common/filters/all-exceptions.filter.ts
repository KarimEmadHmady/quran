import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { EnvVars } from '../../config/env.validation';
import { buildErrorBody, pathOnly, reasonPhrase } from '../http/error-body';
import { getRequestId } from '../http/request-id.middleware';

const GENERIC_500 = 'Internal server error';

/** Errors from Express middleware (e.g. body-parser "request entity too large") carry a 4xx status. */
interface ClientHttpError {
  status: number;
  expose?: boolean;
  message: string;
}

function isClientHttpError(e: unknown): e is ClientHttpError {
  if (typeof e !== 'object' || e === null) return false;
  const status = (e as { status?: unknown }).status;
  return typeof status === 'number' && status >= 400 && status < 500;
}

interface Resolved {
  status: number;
  message: string;
  details?: string[];
}

/**
 * Global filter: turns EVERY error into the single ErrorBody JSON shape.
 * - Never includes stack traces in responses (they are logged server-side for 5xx only).
 * - In production, unexpected (non-HttpException) errors become a generic 500 message.
 */
@Catch()
@Injectable()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');
  private readonly isProduction: boolean;

  constructor(config: ConfigService<EnvVars, true>) {
    this.isProduction = config.get('NODE_ENV', { infer: true }) === 'production';
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    const resolved = this.resolve(exception);
    const { status, details } = resolved;
    let message = resolved.message;
    // Nest's router 404 message embeds the full URL ("Cannot GET /x?token=..."): never echo
    // the query string back.
    if (status === 404 && message.startsWith('Cannot ')) {
      message = `Cannot ${req.method} ${pathOnly(req.originalUrl ?? req.url)}`;
    }

    if (status >= 500) {
      const stack = exception instanceof Error ? exception.stack : String(exception);
      this.logger.error(`${status} rid=${getRequestId(req) ?? '-'}: ${stack ?? ''}`);
    }

    if (res.headersSent) return;
    res.status(status).json(buildErrorBody({ status, message, details, req }));
  }

  resolve(exception: unknown): Resolved {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      if (typeof response === 'string') return { status, message: response };
      const raw = (response as { message?: unknown }).message;
      if (Array.isArray(raw)) {
        const details = raw.filter((m): m is string => typeof m === 'string');
        return {
          status,
          message: status === 400 ? 'Validation failed' : reasonPhrase(status),
          details,
        };
      }
      return { status, message: typeof raw === 'string' ? raw : reasonPhrase(status) };
    }

    if (isClientHttpError(exception)) {
      const message =
        exception.expose === false ? reasonPhrase(exception.status) : exception.message;
      return { status: exception.status, message };
    }

    const status = HttpStatus.INTERNAL_SERVER_ERROR;
    if (this.isProduction || !(exception instanceof Error)) return { status, message: GENERIC_500 };
    return { status, message: exception.message || GENERIC_500 };
  }
}
