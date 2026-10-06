import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { manageToken } from '../src/bookings/manage-token.js';
import { APP_CONFIG, type AppConfig } from '../src/config.js';
import { BookingEmailSender } from '../src/jobs/booking-email.sender.js';
import { jobId } from '../src/jobs/job-ids.js';
import { EMAIL_QUEUE, type EmailJob } from '../src/jobs/queues.js';
import { ReminderScheduler } from '../src/jobs/reminder.scheduler.js';
import { MailService } from '../src/mail/mail.service.js';
import { OutboxService } from '../src/outbox/outbox.service.js';
import { type BookableBusiness, bookableBusiness, customer, key, publicBook, ukTime } from './booking-helpers.js';
import { as, ORIGIN, resetDb, startApp, type TestApp } from './helpers.js';

let t: TestApp;
let biz: BookableBusiness;
let queue: Queue<EmailJob>;
let outbox: OutboxService;
let reminders: ReminderScheduler;
let mail: MailService;
let sender: BookingEmailSender;
let config: AppConfig;

beforeAll(async () => {
  t = await startApp();
  await resetDb(t.prisma);
  config = t.app.get(APP_CONFIG);
  queue = t.app.get(getQueueToken(EMAIL_QUEUE));
  outbox = t.app.get(OutboxService);
  reminders = t.app.get(ReminderScheduler);
  // The worker's classes, built by hand so no BullMQ worker consumes jobs behind the test's back.
  mail = new MailService(config);
  sender = new BookingEmailSender(config, t.prisma, mail);
  biz = await bookableBusiness(t);
});
afterAll(() => t.close());
beforeEach(async () => {
  await queue.obliterate({ force: true });
  mail.outbox.length = 0;
});

/** Waits for the API's after-commit fast path to finish with every outbox event. */
const settle = async () => {
  for (let i = 0; i < 50; i++) {
    if ((await t.prisma.outboxEvent.count({ where: { processedAt: null } })) === 0) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('outbox did not settle');
};

const book = async (days: number, hhmm: string) => {
  const res = await publicBook(t, biz.slug, { serviceId: biz.serviceId, staffId: biz.staffId, startsAt: ukTime(days, hhmm), customer: customer() }).expect(201);
  await settle();
  return res.body.id as string;
};

describe('outbox → jobs', () => {
  it('a booking enqueues its confirmation, the owner notice and a reminder (deterministic ids)', async () => {
    const id = await book(10, '09:00');
    expect(await queue.getJob(jobId.confirmEmail(id, 1))).toBeDefined();
    expect(await queue.getJob(jobId.ownerEmail(id, 1))).toBeDefined();
    const reminder = await queue.getJob(jobId.reminder(id));
    expect(reminder?.data).toMatchObject({ kind: 'reminder', bookingId: id, version: 1 });
    // Fires 24 h before the start.
    const startsAt = new Date(ukTime(10, '09:00')).getTime();
    expect(Math.abs(reminder!.timestamp + reminder!.delay - (startsAt - 24 * 3600_000))).toBeLessThan(5_000);
  });

  it('crash after commit, before enqueue: the relay picks the event up and enqueues it', async () => {
    const id = await book(10, '10:00');
    // Simulate the lost fast path: Redis has nothing, the event looks unprocessed.
    await queue.obliterate({ force: true });
    await t.prisma.outboxEvent.updateMany({ data: { processedAt: null } });
    expect(await queue.getJob(jobId.confirmEmail(id, 1))).toBeUndefined();

    expect(await outbox.relay()).toBeGreaterThan(0);
    expect(await queue.getJob(jobId.confirmEmail(id, 1))).toBeDefined();
    expect(await t.prisma.outboxEvent.count({ where: { processedAt: null } })).toBe(0);
  });

  it('processing the same event twice enqueues each job once', async () => {
    const id = await book(10, '11:00');
    const before = await queue.getJobCounts('wait', 'delayed');
    const thisEvent = { payloadJson: { path: ['bookingId'], equals: id } };
    await t.prisma.outboxEvent.updateMany({ where: thisEvent, data: { processedAt: null } });
    await outbox.relay();
    await t.prisma.outboxEvent.updateMany({ where: thisEvent, data: { processedAt: null } });
    await outbox.relay();
    expect(await queue.getJobCounts('wait', 'delayed')).toEqual(before);
    expect(await queue.getJob(jobId.confirmEmail(id, 1))).toBeDefined();
  });
});

describe('job ids', () => {
  it('ids from the helper are accepted by real BullMQ; ids with ":" are rejected (why the helper exists)', async () => {
    const id = jobId.reminder('01a10ec3-7128-7057-a39e-5d5020486ee3');
    const job = await queue.add('booking', { type: 'booking', kind: 'reminder', bookingId: 'x', version: 1 }, { jobId: id, delay: 60_000 });
    expect(job.id).toBe(id);
    await expect(
      queue.add('booking', { type: 'booking', kind: 'reminder', bookingId: 'x', version: 1 }, { jobId: 'reminder:abc' }),
    ).rejects.toThrow();
    expect(() => jobId.reminder('bad:id')).toThrow();
  });
});

describe('sending', () => {
  it('confirmation: one email with the manage link and a METHOD:REQUEST .ics; sending again does nothing', async () => {
    const id = await book(11, '09:00');
    const job = { type: 'booking', kind: 'confirmation', bookingId: id, version: 1 } as const;
    expect(await sender.send(job)).toBe('sent');
    expect(await sender.send(job)).toBe('skipped'); // email_log dedupe (e.g. a retried job)
    expect(mail.outbox).toHaveLength(1);
    const msg = mail.outbox[0]!;
    expect(msg.text).toContain(`${config.WEB_URL}/manage/${manageToken(config.MANAGE_TOKEN_SECRET, id)}`);
    expect(msg.ics?.content).toContain('METHOD:REQUEST');
    expect(msg.ics?.content).toContain(`UID:${id}@slotwise`);
    expect(msg.ics?.content).toContain('SEQUENCE:1');
    expect(await t.prisma.emailLog.count({ where: { bookingId: id } })).toBe(1);
  });

  it('a stale reminder (booking moved since) sends nothing; the moved booking gets a new reminder', async () => {
    const id = await book(12, '09:00');
    await t.http
      .post(`/api/v1/bookings/${id}/reschedule`)
      .set('Origin', ORIGIN)
      .set('Cookie', biz.cookie)
      .set('Idempotency-Key', key())
      .send({ startsAt: ukTime(12, '10:00') })
      .expect(200);
    await settle();
    expect(await sender.send({ type: 'booking', kind: 'reminder', bookingId: id, version: 1 })).toBe('skipped');
    expect(mail.outbox).toHaveLength(0);
    expect((await queue.getJob(jobId.reminder(id)))?.data).toMatchObject({ version: 2 });
    expect(await queue.getJob(jobId.rescheduleEmail(id, 2))).toBeDefined();
  });

  it('a cancelled booking gets no reminder, and its cancellation carries METHOD:CANCEL with the same UID', async () => {
    const id = await book(13, '09:00');
    await as(t, biz).post(`/api/v1/bookings/${id}/cancel`).expect(200);
    await settle();
    expect(await queue.getJob(jobId.reminder(id))).toBeUndefined();
    expect(await sender.send({ type: 'booking', kind: 'reminder', bookingId: id, version: 2 })).toBe('skipped');
    expect(await sender.send({ type: 'booking', kind: 'cancellation', bookingId: id, version: 2 })).toBe('sent');
    expect(mail.outbox[0]?.ics?.content).toContain('METHOD:CANCEL');
    expect(mail.outbox[0]?.ics?.content).toContain(`UID:${id}@slotwise`);
  });
});

describe('reminders', () => {
  it('reconcile restores a reminder that Redis lost (and is a no-op otherwise)', async () => {
    const id = await book(14, '09:00');
    await (await queue.getJob(jobId.reminder(id)))!.remove();
    await reminders.reconcile();
    expect((await queue.getJob(jobId.reminder(id)))?.data).toMatchObject({ bookingId: id, version: 1 });
    const counts = await queue.getJobCounts('delayed');
    await reminders.reconcile();
    expect(await queue.getJobCounts('delayed')).toEqual(counts);
  });

  it('booked less than 24 h ahead: no reminder; booked earlier but Redis lost it inside the window: sent now', async () => {
    const now = Date.now();
    const id = '01a10ec3-0000-7000-8000-000000000001';
    await reminders.sync({ id, status: 'confirmed', startsAt: new Date(now + 10 * 3600_000), version: 1, changedAt: new Date(now) }, now);
    expect(await queue.getJob(jobId.reminder(id))).toBeUndefined();
    // Made 3 days ago for 10 h from now: the reminder should exist; reconcile-style sync sends it straight away.
    await reminders.sync(
      { id, status: 'confirmed', startsAt: new Date(now + 10 * 3600_000), version: 1, changedAt: new Date(now - 3 * 86_400_000) },
      now,
    );
    const job = await queue.getJob(jobId.reminder(id));
    expect(job?.delay).toBe(0);
  });
});

describe('manage link', () => {
  const link = (id: string) => `/api/v1/public/manage/${manageToken(config.MANAGE_TOKEN_SECRET, id)}`;

  it('shows the booking and lets the customer cancel it once', async () => {
    const id = await book(15, '09:00');
    const view = await t.http.get(link(id)).expect(200);
    expect(view.body.booking.id).toBe(id);
    expect(view.body.blockedReason).toBeNull();
    const cancelled = await t.http.post(link(id) + '/cancel').expect(200);
    expect(cancelled.body.blockedReason).toBe('cancelled');
    const row = await t.prisma.auditLog.findFirstOrThrow({ where: { entityId: id, action: 'booking.cancelled' } });
    expect(row.actorType).toBe('customer');
  });

  it('lets the customer move the booking (Idempotency-Key required)', async () => {
    const id = await book(15, '11:00');
    await t.http.post(link(id) + '/reschedule').send({ startsAt: ukTime(15, '12:00') }).expect(400);
    const res = await t.http
      .post(link(id) + '/reschedule')
      .set('Idempotency-Key', key())
      .send({ startsAt: ukTime(15, '12:00') })
      .expect(200);
    expect(res.body.booking.startsAt).toBe(new Date(ukTime(15, '12:00')).toISOString());
  });

  it('a wrong token is not found', async () => {
    await t.http.get(`/api/v1/public/manage/${'A'.repeat(43)}`).expect(404);
  });

  it('inside the cut-off the customer is told to contact the business; owners can still change it', async () => {
    await t.prisma.business.update({ where: { id: biz.businessId }, data: { cancelCutoffHours: 24 * 30 } });
    const id = await book(16, '09:00');
    const view = await t.http.get(link(id)).expect(200);
    expect(view.body.blockedReason).toBe('cutoff');
    const res = await t.http.post(link(id) + '/cancel').expect(409);
    expect(res.body.errorCode).toBe('CUTOFF_PASSED');
    await as(t, biz).post(`/api/v1/bookings/${id}/cancel`).expect(200);
    await t.prisma.business.update({ where: { id: biz.businessId }, data: { cancelCutoffHours: 0 } });
  });
});
