import { BullModule } from '@nestjs/bullmq';
import { type DynamicModule, Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PublicCache } from './business/public-cache.js';
import { RateLimiter } from './common/rate-limit.js';
import { APP_CONFIG, type AppConfig } from './config.js';
import { EMAIL_QUEUE, MAINTENANCE_QUEUE, WEBHOOK_QUEUE } from './jobs/queues.js';
import { ReminderScheduler } from './jobs/reminder.scheduler.js';
import { BookingEventsHandler } from './outbox/booking-events.handler.js';
import { WebhookFanout } from './outbox/webhook-fanout.js';
import { WebhookDeliveryService } from './webhooks/delivery.service.js';
import { WebhookSender } from './webhooks/webhook-sender.js';
import { OutboxService } from './outbox/outbox.service.js';
import { PrismaService } from './prisma/prisma.service.js';
import { RedisService } from './redis/redis.service.js';

/** redis://user:pass@host:port/db → ioredis options (BullMQ wants options, not a URL). */
export const redisConnection = (url: string) => {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    db: Number(u.pathname.slice(1) || 0),
    ...(u.username ? { username: decodeURIComponent(u.username) } : {}),
    ...(u.password ? { password: decodeURIComponent(u.password) } : {}),
    maxRetriesPerRequest: null,
  };
};

const shared = [
  PrismaService,
  RedisService,
  RateLimiter,
  PublicCache,
  OutboxService,
  BookingEventsHandler,
  ReminderScheduler,
  WebhookFanout,
  WebhookDeliveryService,
  WebhookSender,
];

/** Everything both the API and the worker need: config, database, Redis, queues, outbox. */
@Global()
@Module({})
export class CoreModule {
  static forConfig(config: AppConfig): DynamicModule {
    return {
      module: CoreModule,
      imports: [
        BullModule.forRoot({ connection: redisConnection(config.REDIS_URL), prefix: config.QUEUE_PREFIX }),
        BullModule.registerQueue({ name: EMAIL_QUEUE }, { name: WEBHOOK_QUEUE }, { name: MAINTENANCE_QUEUE }),
        JwtModule.register({ secret: config.JWT_SECRET, signOptions: { algorithm: 'HS256' }, verifyOptions: { algorithms: ['HS256'] } }),
      ],
      providers: [{ provide: APP_CONFIG, useValue: config }, ...shared],
      exports: [APP_CONFIG, BullModule, JwtModule, ...shared],
    };
  }
}
