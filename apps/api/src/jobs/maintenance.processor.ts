import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { requestContext } from '../common/request-context.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { MAINTENANCE_QUEUE, type MaintenanceJobName } from './queues.js';

/** Repeating jobs, registered when the worker starts. Times are UK local time. */
const SCHEDULES: { name: MaintenanceJobName; repeat: { every: number } | { pattern: string; tz: string } }[] = [
  { name: 'outbox-relay', repeat: { every: 5_000 } },
];

@Processor(MAINTENANCE_QUEUE, { concurrency: 1 })
export class MaintenanceProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly log = new Logger('Maintenance');

  constructor(
    @InjectQueue(MAINTENANCE_QUEUE) private readonly queue: Queue,
    @Inject(OutboxService) private readonly outbox: OutboxService,
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
      default:
        return undefined;
    }
  }
}
