import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import type { Job } from 'bullmq';
import { requestContext } from '../common/request-context.js';
import { AuthEmailSender } from './auth-email.sender.js';
import { BookingEmailSender } from './booking-email.sender.js';
import { EMAIL_QUEUE, type EmailJob } from './queues.js';

@Processor(EMAIL_QUEUE, { concurrency: 5 })
export class EmailProcessor extends WorkerHost {
  constructor(
    @Inject(AuthEmailSender) private readonly auth: AuthEmailSender,
    @Inject(BookingEmailSender) private readonly booking: BookingEmailSender,
  ) {
    super();
  }

  process(job: Job<EmailJob>): Promise<unknown> {
    return requestContext.run({ requestId: job.id ?? 'job' }, () => this.run(job.data));
  }

  run(data: EmailJob): Promise<unknown> {
    return data.type === 'auth' ? this.auth.send(data.kind, data.userId) : this.booking.send(data);
  }
}
