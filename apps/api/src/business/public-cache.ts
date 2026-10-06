import { Inject, Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service.js';

/** Cache of the public business profile (widget boot). 60 s TTL; cleared whenever the profile changes. */
@Injectable()
export class PublicCache {
  static readonly TTL_SEC = 60;

  constructor(@Inject(RedisService) private readonly redis: RedisService) {}

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
}
