import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import type { EnvVars } from '../config/env.validation';
import { AdminAuthGuard } from './auth/admin-auth.guard';
import { AdminContentModule } from './content/admin-content.module';
import { JWT_AUDIENCE, JWT_ISSUER } from './auth/auth.constants';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import {
  CLOCK,
  InMemoryLockoutStore,
  LOCKOUT_STORE,
  LoginLockoutService,
} from './auth/login-lockout';

@Module({
  imports: [
    AdminContentModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvVars, true>) => ({
        secret: config.get('JWT_SECRET', { infer: true }),
        signOptions: {
          algorithm: 'HS256',
          expiresIn: config.get('JWT_EXPIRES_IN', { infer: true }),
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
        },
        verifyOptions: { algorithms: ['HS256'], issuer: JWT_ISSUER, audience: JWT_AUDIENCE },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    LoginLockoutService,
    { provide: CLOCK, useValue: () => Date.now() },
    { provide: LOCKOUT_STORE, useFactory: () => new InMemoryLockoutStore() },
    // Registered after the throttler guard (AppModule), so throttling runs first.
    { provide: APP_GUARD, useClass: AdminAuthGuard },
  ],
})
export class AdminModule {}
