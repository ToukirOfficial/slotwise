import { Inject, Injectable } from '@nestjs/common';
import type { PublicBusiness } from '@slotwise/shared';
import { PublicCache } from '../business/public-cache.js';
import { notFound } from '../common/errors.js';
import type { Business } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** The customer-facing side: only businesses whose owner has verified their email exist here. */
@Injectable()
export class PublicService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PublicCache) private readonly cache: PublicCache,
  ) {}

  async liveBusiness(slug: string): Promise<Business> {
    const business = await this.prisma.business.findUnique({ where: { slug } });
    if (!business?.verifiedAt) throw notFound('Business not found.');
    return business;
  }

  /** Widget boot data, cached for 60 s (cleared whenever services, staff or settings change). */
  async profile(slug: string): Promise<PublicBusiness> {
    const cached = await this.cache.get<PublicBusiness>(slug);
    if (cached) return cached;

    const business = await this.liveBusiness(slug);
    const staff = await this.prisma.staff.findMany({
      where: { businessId: business.id, active: true },
      select: { id: true, displayName: true, services: { where: { service: { active: true } }, select: { serviceId: true } } },
      orderBy: { displayName: 'asc' },
    });
    const bookable = new Set(staff.flatMap((s) => s.services.map((x) => x.serviceId)));
    const services = await this.prisma.service.findMany({
      where: { businessId: business.id, active: true, id: { in: [...bookable] } },
      select: { id: true, name: true, durationMin: true, pricePence: true },
      orderBy: { name: 'asc' },
    });
    const profile: PublicBusiness = {
      name: business.name,
      slug: business.slug,
      timezone: business.timezone,
      brandColor: business.brandColor,
      contactEmail: business.contactEmail,
      contactPhone: business.contactPhone,
      services,
      staff: staff
        .filter((s) => s.services.length > 0)
        .map((s) => ({ id: s.id, displayName: s.displayName, serviceIds: s.services.map((x) => x.serviceId) })),
    };
    await this.cache.set(slug, profile);
    return profile;
  }
}
