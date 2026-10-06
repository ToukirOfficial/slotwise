import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ErrorCode } from '@slotwise/shared';
import { ACCESS_TTL_SEC, REFRESH_TTL_SEC } from '../common/cookies.js';
import { randomToken, safeEqualHex, sha256 } from '../common/crypto.js';
import { AppError } from '../common/errors.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** What the access token carries, so most requests need no database lookup to authenticate. */
export interface AccessPayload {
  sub: string; // user id
  bid: string; // business id
  role: 'owner' | 'staff';
  stf: string | null; // staff id
  demo: boolean;
}

export interface IssuedTokens {
  userId: string;
  access: string;
  refresh: string;
}

const expired = () => new AppError(401, ErrorCode.SESSION_EXPIRED, 'Your session has ended. Please log in again.');

/**
 * Access token: short-lived JWT. Refresh token: `<sessionId>.<secret>`, stored as SHA-256 of the secret,
 * rotated on every use. All rotations of one login share a familyId; presenting a refresh token that was
 * already rotated (a stolen copy, or a replay) revokes the whole family.
 */
@Injectable()
export class SessionsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwt: JwtService,
  ) {}

  /** New login: a new family. */
  async start(userId: string): Promise<IssuedTokens> {
    return this.issue(userId, randomUUID());
  }

  async rotate(refreshToken: string | undefined): Promise<IssuedTokens> {
    const [sessionId, secret] = (refreshToken ?? '').split('.');
    if (!sessionId || !secret || !/^[0-9a-f-]{36}$/.test(sessionId)) throw expired();

    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!session || !safeEqualHex(session.refreshTokenHash, sha256(secret))) throw expired();

    if (session.revokedAt || session.replacedById) {
      // Reuse of a rotated token: someone else may hold this family. End all of it.
      await this.revokeFamily(session.familyId);
      throw expired();
    }
    if (session.expiresAt <= new Date()) throw expired();

    return this.issue(session.userId, session.familyId, session.id);
  }

  async revokeFamilyOf(refreshToken: string | undefined): Promise<void> {
    const sessionId = (refreshToken ?? '').split('.')[0];
    if (!sessionId || !/^[0-9a-f-]{36}$/.test(sessionId)) return;
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (session) await this.revokeFamily(session.familyId);
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.session.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  private async issue(userId: string, familyId: string, replacesId?: string): Promise<IssuedTokens> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { business: true, staff: true } });
    if (!user || !user.passwordHash) throw expired();

    const secret = randomToken();
    const session = await this.prisma.$transaction(async (tx) => {
      const created = await tx.session.create({
        data: {
          userId,
          familyId,
          refreshTokenHash: sha256(secret),
          expiresAt: new Date(Date.now() + REFRESH_TTL_SEC * 1000),
        },
      });
      if (replacesId) {
        // Conditional update: of two concurrent rotations of the same token, only one wins.
        const { count } = await tx.session.updateMany({
          where: { id: replacesId, replacedById: null, revokedAt: null },
          data: { replacedById: created.id },
        });
        if (count === 0) throw expired();
      }
      return created;
    });

    const payload: AccessPayload = {
      sub: user.id,
      bid: user.businessId,
      role: user.role,
      stf: user.staff?.id ?? null,
      demo: user.business.isDemo,
    };
    const access = await this.jwt.signAsync(payload, { expiresIn: ACCESS_TTL_SEC });
    return { userId, access, refresh: `${session.id}.${secret}` };
  }
}
