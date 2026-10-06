import { Injectable } from '@nestjs/common';
import type { EmailJob } from './queues.js';

/** Booking emails (confirmation, cancellation, reschedule, reminder, owner notice). Filled in by the email phase. */
@Injectable()
export class BookingEmailSender {
  async send(_job: Extract<EmailJob, { type: 'booking' }>): Promise<void> {}
}
