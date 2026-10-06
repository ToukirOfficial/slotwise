import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { randomToken, sha256 } from '../common/crypto.js';
import { MailService } from '../mail/mail.service.js';
import { renderEmail } from '../mail/templates.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthEmailKind } from './queues.js';

const TTL_MS: Record<AuthEmailKind, number> = {
  verify_email: 24 * 3600_000,
  reset_password: 3600_000,
  staff_invite: 7 * 24 * 3600_000,
};

/**
 * Sends verify / reset / invite emails. The token is created here, in the worker, so the plain token never
 * sits in the database or in Redis: only its hash is stored.
 */
@Injectable()
export class AuthEmailSender {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MailService) private readonly mail: MailService,
  ) {}

  async send(kind: AuthEmailKind, userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { business: true, staff: true },
    });
    if (!user) return;
    if (user.business.isDemo) return; // demo businesses never send email
    if (kind === 'verify_email' && user.emailVerifiedAt) return;
    if (kind === 'staff_invite' && user.passwordHash) return; // already accepted

    const token = randomToken();
    await this.prisma.authToken.create({
      data: { userId, kind, tokenHash: sha256(token), expiresAt: new Date(Date.now() + TTL_MS[kind]) },
    });
    const link = (path: string) => `${this.config.WEB_URL}${path}?token=${token}`;
    const biz = user.business.name;

    const msg =
      kind === 'verify_email'
        ? renderEmail({
            to: user.email,
            subject: 'Confirm your email for Slotwise',
            heading: 'Confirm your email',
            lines: [`Confirm your email to make ${biz} live for bookings. The link works for 24 hours.`],
            action: { label: 'Confirm email', url: link('/verify-email') },
            footer: 'If you didn’t sign up for Slotwise, you can ignore this email.',
          })
        : kind === 'reset_password'
          ? renderEmail({
              to: user.email,
              subject: 'Reset your Slotwise password',
              heading: 'Reset your password',
              lines: ['Someone asked to reset your password. The link works once, for 1 hour.'],
              action: { label: 'Choose a new password', url: link('/reset-password') },
              footer: 'If this wasn’t you, ignore this email: your password hasn’t changed.',
            })
          : renderEmail({
              to: user.email,
              subject: `You’re invited to ${biz} on Slotwise`,
              heading: `Join ${biz}`,
              lines: [`${biz} invited you to see your diary on Slotwise. The link works for 7 days.`],
              action: { label: 'Set your password', url: link('/accept-invite') },
            });
    await this.mail.send(msg, `auth-${kind}`);
  }
}
