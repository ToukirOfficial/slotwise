import { Inject, Injectable } from '@nestjs/common';
import { ErrorCode, type Me, RESERVED_SLUGS, type RegisterBody } from '@slotwise/shared';
import { sha256 } from '../common/crypto.js';
import { AppError } from '../common/errors.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthTokenKind } from '../generated/prisma/client.js';
import { hashPassword, verifyPassword } from './passwords.js';
import { type IssuedTokens, SessionsService } from './sessions.service.js';

const invalidToken = () =>
  new AppError(400, ErrorCode.TOKEN_INVALID, 'This link is invalid or has expired. Ask for a new one.');

/** "Demo Physio Clinic" → "demo-physio-clinic". */
export const slugify = (name: string): string =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'business';

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SessionsService) private readonly sessions: SessionsService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  /** Creates the business, its owner login and the owner's staff row in one transaction. */
  async register(body: RegisterBody): Promise<IssuedTokens> {
    const passwordHash = await hashPassword(body.password);
    const slug = await this.freeSlug(slugify(body.businessName));

    const { userId, eventId } = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { email: body.email } });
      if (existing?.passwordHash) {
        throw new AppError(409, ErrorCode.EMAIL_TAKEN, 'An account with this email already exists. Try logging in.');
      }
      // An invite that was never accepted doesn't reserve the email.
      if (existing) await tx.user.delete({ where: { id: existing.id } });

      const business = await tx.business.create({ data: { name: body.businessName, slug, contactEmail: body.email } });
      const user = await tx.user.create({
        data: { businessId: business.id, email: body.email, passwordHash, role: 'owner' },
      });
      await tx.staff.create({ data: { businessId: business.id, userId: user.id, displayName: body.name } });
      const eventId = await this.outbox.add(tx, business.id, { type: 'auth.verify_email', userId: user.id });
      return { userId: user.id, eventId };
    });
    this.outbox.dispatchSoon([eventId]);
    return this.sessions.start(userId);
  }

  async login(email: string, password: string): Promise<IssuedTokens> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    const ok = await verifyPassword(user?.passwordHash, password);
    if (!user || !ok) throw new AppError(401, ErrorCode.INVALID_CREDENTIALS, 'Email or password is incorrect.');
    return this.sessions.start(user.id);
  }

  async verifyEmail(token: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const row = await this.consumeToken(tx, token, 'verify_email');
      const user = await tx.user.update({ where: { id: row.userId }, data: { emailVerifiedAt: new Date() } });
      if (user.role === 'owner') {
        await tx.business.updateMany({ where: { id: user.businessId, verifiedAt: null }, data: { verifiedAt: new Date() } });
      }
    });
  }

  async resendVerification(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.emailVerifiedAt) return;
    const eventId = await this.prisma.$transaction((tx) =>
      this.outbox.add(tx, user.businessId, { type: 'auth.verify_email', userId }),
    );
    this.outbox.dispatchSoon([eventId]);
  }

  /** Always succeeds from the caller's point of view, so it can't be used to find out who has an account. */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email }, include: { business: true } });
    if (!user?.passwordHash || user.business.isDemo) return;
    const eventId = await this.prisma.$transaction((tx) =>
      this.outbox.add(tx, user.businessId, { type: 'auth.reset_password', userId: user.id }),
    );
    this.outbox.dispatchSoon([eventId]);
  }

  async resetPassword(token: string, password: string): Promise<void> {
    const passwordHash = await hashPassword(password);
    const userId = await this.prisma.$transaction(async (tx) => {
      const row = await this.consumeToken(tx, token, 'reset_password');
      // Reaching the link proves the email address too.
      await tx.user.update({
        where: { id: row.userId },
        data: { passwordHash, emailVerifiedAt: row.user.emailVerifiedAt ?? new Date() },
      });
      return row.userId;
    });
    await this.sessions.revokeAllForUser(userId); // log out everywhere after a reset
  }

  async acceptInvite(token: string, password: string): Promise<IssuedTokens> {
    const passwordHash = await hashPassword(password);
    const userId = await this.prisma.$transaction(async (tx) => {
      const row = await this.consumeToken(tx, token, 'staff_invite');
      if (row.user.passwordHash) throw invalidToken();
      await tx.user.update({ where: { id: row.userId }, data: { passwordHash, emailVerifiedAt: new Date() } });
      return row.userId;
    });
    return this.sessions.start(userId);
  }

  async me(userId: string): Promise<Me> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { business: true, staff: true } });
    if (!user) throw new AppError(401, ErrorCode.UNAUTHENTICATED, 'Please log in.');
    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerifiedAt !== null,
        staffId: user.staff?.id ?? null,
        name: user.staff?.displayName ?? user.email,
      },
      business: {
        id: user.business.id,
        name: user.business.name,
        slug: user.business.slug,
        isDemo: user.business.isDemo,
        live: user.business.verifiedAt !== null,
      },
    };
  }

  /** Marks a single-use token as used. The conditional update makes double use impossible. */
  private async consumeToken(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    token: string,
    kind: AuthTokenKind,
  ) {
    const row = await tx.authToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
    if (!row || row.kind !== kind || row.usedAt || row.expiresAt <= new Date()) throw invalidToken();
    const { count } = await tx.authToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
    if (count === 0) throw invalidToken();
    return row;
  }

  private async freeSlug(base: string): Promise<string> {
    const root = base.length >= 3 && !RESERVED_SLUGS.has(base) ? base : `${base}-biz`;
    for (let i = 0; i < 20; i++) {
      const candidate = i === 0 ? root : `${root}-${Math.floor(1000 + Math.random() * 9000)}`;
      const taken = await this.prisma.business.findUnique({ where: { slug: candidate }, select: { id: true } });
      if (!taken) return candidate;
    }
    throw new AppError(409, ErrorCode.SLUG_TAKEN, 'Couldn’t create a web address for this business. Try another name.');
  }
}
