import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { ThrottlerStorageService } from '@nestjs/throttler';
import { ErrorCode } from '@slotwise/shared';
import { AppError } from './errors.js';

/**
 * Fixed-window limits on named keys (e.g. `login:ip:1.2.3.4`), backed by @nestjs/throttler's in-memory store.
 * In-memory is correct here because the API runs as one process (PM2 fork mode).
 */
@Injectable()
export class RateLimiter implements OnApplicationShutdown {
  private readonly storage = new ThrottlerStorageService();

  /** Counts one hit; throws 429 with Retry-After once `limit` hits land inside `windowSec`. */
  async hit(key: string, limit: number, windowSec: number): Promise<void> {
    const ms = windowSec * 1000;
    const record = await this.storage.increment(key, ms, limit, ms, 'slotwise');
    if (record.isBlocked) {
      const retryAfter = Math.max(1, record.timeToBlockExpire);
      throw new AppError(
        429,
        ErrorCode.RATE_LIMITED,
        `Too many requests. Try again in ${retryAfter} seconds.`,
        undefined,
        { 'Retry-After': String(retryAfter) },
      );
    }
  }

  onApplicationShutdown(): void {
    this.storage.onApplicationShutdown();
  }
}
