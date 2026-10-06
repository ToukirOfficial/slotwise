import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { APP_CONFIG, type AppConfig } from '../config.js';

/** Cache client. Keys are always `slotwise:cache:*` with a TTL (the instance is shared with other sites). */
@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.client = new Redis(config.REDIS_URL, {
      keyPrefix: `${config.QUEUE_PREFIX}:cache:`,
      maxRetriesPerRequest: 1,
      commandTimeout: 2000,
      lazyConnect: false,
    });
    this.client.on('error', () => undefined); // reported by /api/health, not as crash noise
  }

  async getJson<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.client.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null; // cache is an optimisation; never fail a request because of it
    }
  }

  async setJson(key: string, value: unknown, ttlSec: number): Promise<void> {
    try {
      await this.client.set(key, JSON.stringify(value), 'EX', ttlSec);
    } catch {
      /* see getJson */
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch {
      /* see getJson */
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit().catch(() => undefined);
  }
}
