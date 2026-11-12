import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { setupApp } from './bootstrap/setup-app';
import type { EnvVars } from './config/env.validation';

async function bootstrap(): Promise<void> {
  // bodyParser: false -> setupApp installs the only (size-limited) JSON parser.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  setupApp(app);
  const config = app.get<ConfigService<EnvVars, true>>(ConfigService);
  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  Logger.log(`API listening on port ${port}`, 'Bootstrap');
}

bootstrap().catch((err: unknown) => {
  // Env validation errors never contain values, so printing the message is safe.
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
