import {
  Body,
  Controller,
  createParamDecorator,
  ExecutionContext,
  Get,
  HttpCode,
  Post,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { RateLimit } from '../../common/throttling/rate-limit.decorator';
import { THROTTLER } from '../../common/throttling/throttler.config';
import type { EnvVars } from '../../config/env.validation';
import { PublicAdminRoute, type AdminRequest, type AuthenticatedAdmin } from './admin-auth.guard';
import {
  ADMIN_SESSION_COOKIE,
  clearSessionCookieOptions,
  sessionCookieOptions,
} from './auth.constants';
import {
  AuthService,
  LoginLockedException,
  type AdminProfile,
  type PublicAdmin,
} from './auth.service';
import { LoginDto } from './dto/login.dto';

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedAdmin => {
    const admin = ctx.switchToHttp().getRequest<AdminRequest>().admin;
    if (!admin) throw new UnauthorizedException('Authentication required');
    return admin;
  },
);

@Controller('admin/auth')
export class AuthController {
  private readonly isProduction: boolean;
  private readonly sessionSeconds: number;

  constructor(
    private readonly auth: AuthService,
    config: ConfigService<EnvVars, true>,
  ) {
    this.isProduction = config.get('NODE_ENV', { infer: true }) === 'production';
    this.sessionSeconds = config.get('JWT_EXPIRES_IN', { infer: true });
  }

  @Post('login')
  @HttpCode(200)
  @PublicAdminRoute()
  @RateLimit(THROTTLER.AUTH)
  async login(
    @Body() { email, password }: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ admin: PublicAdmin }> {
    try {
      const { token, admin } = await this.auth.login(email, password);
      res.cookie(
        ADMIN_SESSION_COOKIE,
        token,
        sessionCookieOptions(this.isProduction, this.sessionSeconds),
      );
      return { admin }; // the token is only ever in the httpOnly cookie
    } catch (err) {
      if (err instanceof LoginLockedException) {
        res.setHeader('Retry-After', String(err.retryAfterSeconds));
      }
      throw err;
    }
  }

  /** Public and idempotent: always clears the cookie. */
  @Post('logout')
  @HttpCode(204)
  @PublicAdminRoute()
  logout(@Res({ passthrough: true }) res: Response): void {
    res.clearCookie(ADMIN_SESSION_COOKIE, clearSessionCookieOptions(this.isProduction));
  }

  @Get('me')
  me(@CurrentAdmin() admin: AuthenticatedAdmin): Promise<AdminProfile> {
    return this.auth.me(admin.id);
  }
}
