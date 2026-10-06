import { Inject, Injectable } from '@nestjs/common';
import { ErrorCode } from '@slotwise/shared';
import type { AuthContext } from '../common/auth.js';
import { safeEqualHex, sha256 } from '../common/crypto.js';
import { AppError } from '../common/errors.js';
import { RateLimiter } from '../common/rate-limit.js';
import { PrismaService } from '../prisma/prisma.service.js';

export const API_KEY_PATTERN = /^sw_live_([a-f0-9]{12})_([A-Za-z0-9_-]{43})$/;
const PER_KEY_PER_MINUTE = 60;

const invalid = () => new AppError(401, ErrorCode.UNAUTHENTICATED, 'Invalid API key.');

/**
 * Resolves `Authorization: Bearer sw_live_<prefix>_<secret>` to a business. Lookup by the public prefix,
 * then a constant-time comparison of the secret's SHA-256. Rate-limited per key (60/min, 429 + Retry-After).
 */
@Injectable()
export class ApiKeyAuthenticator {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RateLimiter) private readonly limiter: RateLimiter,
  ) {}

  async authenticate(token: string): Promise<AuthContext> {
    const match = API_KEY_PATTERN.exec(token);
    if (!match) throw invalid();
    const [, prefix, secret] = match as unknown as [string, string, string];
    const key = await this.prisma.apiKey.findUnique({ where: { prefix }, include: { business: { select: { isDemo: true } } } });
    if (!key || key.revokedAt || !safeEqualHex(key.keyHash, sha256(secret))) throw invalid();

    await this.limiter.hit(`apikey:${key.id}`, PER_KEY_PER_MINUTE, 60);
    // last_used_at to the minute: one write per key per minute, not one per request.
    if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > 60_000) {
      await this.prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
    }
    return { kind: 'apiKey', apiKeyId: key.id, businessId: key.businessId, isDemo: key.business.isDemo };
  }
}
