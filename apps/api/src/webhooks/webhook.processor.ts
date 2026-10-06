import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import type { Job } from 'bullmq';
import { requestContext } from '../common/request-context.js';
import { WEBHOOK_QUEUE, type WebhookJob } from '../jobs/queues.js';
import { backoffStrategy, WebhookDeliveryService } from './delivery.service.js';

@Processor(WEBHOOK_QUEUE, { concurrency: 5, settings: { backoffStrategy } })
export class WebhookProcessor extends WorkerHost {
  constructor(@Inject(WebhookDeliveryService) private readonly deliveries: WebhookDeliveryService) {
    super();
  }

  process(job: Job<WebhookJob>): Promise<unknown> {
    return requestContext.run({ requestId: job.id ?? 'webhook' }, () => this.deliveries.attempt(job.data, job.attemptsMade + 1));
  }
}
