import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';

/** Cache of the public business profile (widget boot). 60 s TTL; cleared whenever the profile changes. */
@Injectable()
export class PublicCache {
  static readonly TTL_SEC = 60;

  constructor(
    @Inject(RedisService) private readonly redis: RedisService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  key = (slug: string) => `public:${slug}`;

  get<T>(slug: string): Promise<T | null> {
    return this.redis.getJson<T>(this.key(slug));
  }

  set(slug: string, value: unknown): Promise<void> {
    return this.redis.setJson(this.key(slug), value, PublicCache.TTL_SEC);
  }

  forget(slug: string): Promise<void> {
    return this.redis.del(this.key(slug));
  }

  /** For changes to services or staff, which only know the business id. */
  async forgetBusiness(businessId: string): Promise<void> {
    const b = await this.prisma.business.findUnique({ where: { id: businessId }, select: { slug: true } });
    if (b) await this.forget(b.slug);
  }
}
