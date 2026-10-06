import { type DynamicModule, Module } from '@nestjs/common';
import type { AppConfig } from './config.js';
import { CoreModule } from './core.module.js';
import { AuthEmailSender } from './jobs/auth-email.sender.js';
import { BookingEmailSender } from './jobs/booking-email.sender.js';
import { EmailProcessor } from './jobs/email.processor.js';
import { MaintenanceProcessor } from './jobs/maintenance.processor.js';
import { MailService } from './mail/mail.service.js';
import { WebhookProcessor } from './webhooks/webhook.processor.js';

export const WORKER_PROVIDERS = [MailService, AuthEmailSender, BookingEmailSender];
export const PROCESSORS = [EmailProcessor, MaintenanceProcessor, WebhookProcessor];

/** The background worker (src/worker.ts): emails, reminders, webhooks, outbox relay, clean-up. */
@Module({})
export class WorkerModule {
  static forConfig(config: AppConfig): DynamicModule {
    return {
      module: WorkerModule,
      imports: [CoreModule.forConfig(config)],
      providers: [...WORKER_PROVIDERS, ...PROCESSORS],
    };
  }
}
