import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { createRequestLogger } from '../common/http/request-logger.middleware';
import { requestIdMiddleware } from '../common/http/request-id.middleware';
import { createUrlLengthGuard } from '../common/http/url-length.middleware';
import type { EnvVars } from '../config/env.validation';
import { buildCorsOptions } from './cors';

/**
 * Express-level setup shared by main.ts and the e2e tests, so tests exercise the exact
 * production pipeline. Must be called BEFORE app.init()/listen().
 * The app must be created with `{ bodyParser: false }` so our size-limited parser is the only one.
 *
 * Nest-level pieces (validation pipe, exception filter, throttler guard) are registered as
 * APP_* providers in AppModule instead, so they get dependency injection.
 */
export function setupApp(app: NestExpressApplication): void {
  const config = app.get<ConfigService<EnvVars, true>>(ConfigService);

  app.set('trust proxy', config.get('TRUST_PROXY', { infer: true }));
  app.disable('x-powered-by');

  // Order matters: id first so every later log line and error body carries it.
  app.use(requestIdMiddleware);
  app.use(createRequestLogger());
  app.use(createUrlLengthGuard(config.get('MAX_URL_LENGTH', { infer: true })));
  app.use(helmet());
  app.use(compression());
  app.use(cookieParser()); // unsigned; the admin session cookie is a signed JWT itself
  app.enableCors(buildCorsOptions(config.get('WEB_ORIGIN', { infer: true })));
  // JSON only; urlencoded/multipart bodies are not accepted by this API.
  app.useBodyParser('json', { limit: config.get('BODY_LIMIT', { infer: true }) });

  app.enableShutdownHooks();
}
