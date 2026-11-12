import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { AppThrottlerGuard } from './common/throttling/app-throttler.guard';
import { buildThrottlerOptions } from './common/throttling/throttler.config';
import { createValidationPipe } from './common/validation/validation.pipe';
import { validateEnv, type EnvVars } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { QuranModule } from './quran/quran.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Tests provide env explicitly instead of reading the developer's .env file.
      ignoreEnvFile: process.env.NODE_ENV === 'test',
      validate: validateEnv,
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvVars, true>) =>
        buildThrottlerOptions({
          THROTTLE_DEFAULT_LIMIT: config.get('THROTTLE_DEFAULT_LIMIT', { infer: true }),
          THROTTLE_DEFAULT_TTL_SECONDS: config.get('THROTTLE_DEFAULT_TTL_SECONDS', { infer: true }),
          THROTTLE_AUTH_LIMIT: config.get('THROTTLE_AUTH_LIMIT', { infer: true }),
          THROTTLE_AUTH_TTL_SECONDS: config.get('THROTTLE_AUTH_TTL_SECONDS', { infer: true }),
          THROTTLE_SEARCH_LIMIT: config.get('THROTTLE_SEARCH_LIMIT', { infer: true }),
          THROTTLE_SEARCH_TTL_SECONDS: config.get('THROTTLE_SEARCH_TTL_SECONDS', { infer: true }),
        }),
    }),
    PrismaModule,
    HealthModule,
    QuranModule,
    AdminModule,
  ],
  providers: [
    { provide: APP_PIPE, useFactory: createValidationPipe },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
  ],
})
export class AppModule {}
