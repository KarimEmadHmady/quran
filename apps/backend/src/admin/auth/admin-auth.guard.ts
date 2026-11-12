import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { ADMIN_SESSION_COOKIE } from './auth.constants';
import type { SessionPayload } from './auth.service';

export const PUBLIC_ADMIN_ROUTE = 'admin:public';
/** Opts a single /admin/* handler out of authentication (login, logout). */
export const PublicAdminRoute = () => SetMetadata(PUBLIC_ADMIN_ROUTE, true);

export interface AuthenticatedAdmin {
  id: number;
}

export interface AdminRequest extends Request {
  admin?: AuthenticatedAdmin;
}

const AUTH_REQUIRED = 'Authentication required';

/** True when a controller's @Controller() path is `admin` or under `admin/`. */
export function isAdminControllerPath(path: unknown): boolean {
  const paths = Array.isArray(path) ? path : [path];
  return paths.some((p) => {
    if (typeof p !== 'string') return false;
    const clean = p.replace(/^\/+/, '').toLowerCase();
    return clean === 'admin' || clean.startsWith('admin/');
  });
}

/**
 * Global guard: every handler in a controller mounted under /admin requires a valid session
 * cookie, unless marked @PublicAdminRoute(). Decided from controller metadata, not the request
 * URL, so URL tricks (case, encoding, extra slashes) cannot skip it, and new admin controllers
 * are protected by default.
 */
@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const controllerPath: unknown = Reflect.getMetadata(PATH_METADATA, context.getClass());
    if (!isAdminControllerPath(controllerPath)) return true;
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(PUBLIC_ADMIN_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AdminRequest>();
    const cookies = req.cookies as Record<string, unknown> | undefined;
    const token = cookies?.[ADMIN_SESSION_COOKIE];
    if (typeof token !== 'string' || token.length === 0) {
      throw new UnauthorizedException(AUTH_REQUIRED);
    }

    let payload: Partial<SessionPayload>;
    try {
      payload = await this.jwt.verifyAsync<SessionPayload>(token);
    } catch {
      throw new UnauthorizedException(AUTH_REQUIRED); // expired, tampered, wrong alg/iss/aud
    }
    const id =
      typeof payload.sub === 'string' && /^[1-9][0-9]{0,9}$/.test(payload.sub)
        ? Number(payload.sub)
        : NaN;
    if (!Number.isSafeInteger(id)) throw new UnauthorizedException(AUTH_REQUIRED);

    req.admin = { id };
    return true;
  }
}
