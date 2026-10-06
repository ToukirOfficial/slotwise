import { Inject, Injectable } from '@nestjs/common';
import { type Business, ErrorCode, type UpdateBusinessBody } from '@slotwise/shared';
import { AppError, notFound } from '../common/errors.js';
import type { Business as BusinessRow } from '../generated/prisma/client.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PublicCache } from './public-cache.js';

export const toBusiness = (b: BusinessRow): Business => ({
  id: b.id,
  name: b.name,
  slug: b.slug,
  timezone: b.timezone,
  brandColor: b.brandColor,
  contactEmail: b.contactEmail,
  contactPhone: b.contactPhone,
  minNoticeMin: b.minNoticeMin,
  maxDaysAhead: b.maxDaysAhead,
  slotStepMin: b.slotStepMin,
  cancelCutoffHours: b.cancelCutoffHours,
  retentionMonths: b.retentionMonths,
  ownerNotifications: b.ownerNotifications,
  isDemo: b.isDemo,
  live: b.verifiedAt !== null,
});

@Injectable()
export class BusinessService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PublicCache) private readonly cache: PublicCache,
  ) {}

  async get(businessId: string): Promise<Business> {
    const b = await this.prisma.business.findUnique({ where: { id: businessId } });
    if (!b) throw notFound();
    return toBusiness(b);
  }

  async update(businessId: string, isDemo: boolean, body: UpdateBusinessBody): Promise<Business> {
    const before = await this.prisma.business.findUnique({ where: { id: businessId } });
    if (!before) throw notFound();
    if (isDemo && body.slug !== undefined && body.slug !== before.slug) {
      throw new AppError(403, ErrorCode.DEMO_RESTRICTED, 'The demo business’s web address can’t be changed.');
    }
    try {
      const b = await this.prisma.business.update({ where: { id: businessId }, data: body });
      await this.cache.forget(before.slug);
      if (b.slug !== before.slug) await this.cache.forget(b.slug);
      return toBusiness(b);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppError(409, ErrorCode.SLUG_TAKEN, 'That web address is taken.', { slug: 'Already taken' });
      }
      throw err;
    }
  }
}
