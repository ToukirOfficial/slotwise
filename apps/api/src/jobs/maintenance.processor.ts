import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { requestContext } from '../common/request-context.js';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { seedDemo } from '../demo/seed.js';
import { CleanupService } from '../maintenance/cleanup.service.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ReminderScheduler } from './reminder.scheduler.js';
import { MAINTENANCE_QUEUE, type MaintenanceJobName } from './queues.js';

/** Repeating jobs, registered when the worker starts. Times are UK local time. */
const SCHEDULES: { name: MaintenanceJobName; repeat: { every: number } | { pattern: string; tz: string } }[] = [
  { name: 'outbox-relay', repeat: { every: 5_000 } },
  { name: 'reminder-reconcile', repeat: { pattern: '7 * * * *', tz: 'Europe/London' } },
  { name: 'cleanup', repeat: { pattern: '0 3 * * *', tz: 'Europe/London' } },
  { name: 'demo-reseed', repeat: { pattern: '0 4 * * *', tz: 'Europe/London' } },
];

@Processor(MAINTENANCE_QUEUE, { concurrency: 1 })
export class MaintenanceProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly log = new Logger('Maintenance');

  constructor(
    @InjectQueue(MAINTENANCE_QUEUE) private readonly queue: Queue,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(ReminderScheduler) private readonly reminders: ReminderScheduler,
    @Inject(CleanupService) private readonly cleanup: CleanupService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {
    super();
  }

  async onApplicationBootstrap(): Promise<void> {
    for (const s of SCHEDULES) {
      await this.queue.upsertJobScheduler(s.name, s.repeat, {
        name: s.name,
        opts: { removeOnComplete: true, removeOnFail: 50 },
      });
    }
  }

  process(job: Job): Promise<unknown> {
    return requestContext.run({ requestId: job.id ?? job.name }, () => this.run(job.name as MaintenanceJobName));
  }

  async run(name: MaintenanceJobName): Promise<unknown> {
    switch (name) {
      case 'outbox-relay': {
        let total = 0;
        for (let n = await this.outbox.relay(); n > 0; n = await this.outbox.relay()) total += n;
        if (total > 0) this.log.log(`relay processed ${total} outbox events`);
        return total;
      }
      case 'reminder-reconcile':
        return this.reminders.reconcile();
      case 'cleanup':
        return this.cleanup.run();
      case 'demo-reseed':
        await seedDemo(this.prisma, this.config.MANAGE_TOKEN_SECRET);
        this.log.log('demo business re-seeded');
        return undefined;
    }
  }
}
