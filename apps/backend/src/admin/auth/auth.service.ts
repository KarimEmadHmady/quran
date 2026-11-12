import { HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare } from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeEmail } from './admin-credentials';
import { DUMMY_PASSWORD_HASH, INVALID_CREDENTIALS_MESSAGE, LOCKED_MESSAGE } from './auth.constants';
import { LoginLockoutService } from './login-lockout';

export interface PublicAdmin {
  id: number;
  email: string;
  name: string | null;
}

export interface AdminProfile extends PublicAdmin {
  createdAt: Date;
  lastLoginAt: Date | null;
}

export interface SessionPayload {
  sub: string;
}

/** 429 for a locked email; the controller copies retryAfterSeconds into Retry-After. */
export class LoginLockedException extends HttpException {
  constructor(readonly retryAfterSeconds: number) {
    super(LOCKED_MESSAGE, HttpStatus.TOO_MANY_REQUESTS);
  }
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly lockout: LoginLockoutService,
  ) {}

  async login(rawEmail: string, password: string): Promise<{ token: string; admin: PublicAdmin }> {
    const email = normalizeEmail(rawEmail);
    const key = `email:${email}`;

    // Locked emails are refused before any password check, even when the password is right.
    const retryAfter = await this.lockout.retryAfterSeconds(key);
    if (retryAfter !== null) throw new LoginLockedException(retryAfter);

    const admin = await this.prisma.admin.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, passwordHash: true },
    });
    // Always run bcrypt (cost 12) so unknown emails and wrong passwords take the same time.
    // bcryptjs.compare uses a constant-time comparison of the hashes.
    const passwordOk = await compare(password, admin?.passwordHash ?? DUMMY_PASSWORD_HASH);

    if (!admin || !passwordOk) {
      await this.lockout.recordFailure(key); // unknown emails are counted too: no enumeration
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    await this.lockout.reset(key);
    await this.prisma.admin.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });
    const token = await this.jwt.signAsync({ sub: String(admin.id) } satisfies SessionPayload);
    return { token, admin: { id: admin.id, email: admin.email, name: admin.name } };
  }

  /** Re-reads the admin so a deleted account loses access immediately. */
  async me(adminId: number): Promise<AdminProfile> {
    const admin = await this.prisma.admin.findUnique({
      where: { id: adminId },
      select: { id: true, email: true, name: true, createdAt: true, lastLoginAt: true },
    });
    if (!admin) throw new UnauthorizedException('Authentication required');
    return admin;
  }
}
