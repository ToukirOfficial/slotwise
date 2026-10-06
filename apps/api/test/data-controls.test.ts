import { Temporal } from 'temporal-polyfill';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { APP_CONFIG, type AppConfig } from '../src/config.js';
import { DEMO_EMAIL, DEMO_PASSWORD, DEMO_SLUG, seedDemo } from '../src/demo/seed.js';
import { AuditService } from '../src/audit/audit.service.js';
import { BookingEmailSender } from '../src/jobs/booking-email.sender.js';
import { MailService } from '../src/mail/mail.service.js';
import { CleanupService } from '../src/maintenance/cleanup.service.js';
import { type BookableBusiness, bookableBusiness, customer, publicBook, ukTime } from './booking-helpers.js';
import { addStaffLogin, as, cookiesOf, ORIGIN, resetDb, type Session, startApp, type TestApp } from './helpers.js';

let t: TestApp;
let a: BookableBusiness;
let b: BookableBusiness;
let aStaff: Session;
let config: AppConfig;

beforeAll(async () => {
  t = await startApp();
  await resetDb(t.prisma);
  config = t.app.get(APP_CONFIG);
  a = await bookableBusiness(t, 'Business A');
  b = await bookableBusiness(t, 'Business B');
  aStaff = await addStaffLogin(t, a);
});
afterAll(() => t.close());

/** A customer whose only booking is in the past (written directly: the API won't book the past). */
let pastSeq = 0;
const pastCustomer = async (biz: BookableBusiness, monthsAgo: number) => {
  const c = customer('past');
  const row = await t.prisma.customer.create({ data: { businessId: biz.businessId, ...c, emailNormalized: c.email } });
  const end = new Date();
  end.setUTCMonth(end.getUTCMonth() - monthsAgo);
  end.setUTCDate(end.getUTCDate() - ++pastSeq); // a different day each time: one staff member can't double-book
  const start = new Date(end.getTime() - 3600_000);
  await t.prisma.booking.create({
    data: {
      businessId: biz.businessId,
      staffId: biz.staffId,
      serviceId: biz.serviceId,
      customerId: row.id,
      startsAt: start,
      endsAt: end,
      blockedStart: start,
      blockedEnd: end,
      serviceName: 'Assessment',
      durationMin: 60,
      bufferBeforeMin: 0,
      bufferAfterMin: 0,
      pricePence: 0,
      source: 'dashboard',
      manageTokenHash: `hash-${row.id}`,
      manageTokenExpiresAt: end,
    },
  });
  return row.id;
};

describe('customer erasure', () => {
  it('blanks name, email and phone; bookings keep their times and service; the audit log holds no personal data', async () => {
    const id = await pastCustomer(a, 2);
    const res = await as(t, a).post(`/api/v1/customers/${id}/erase`).expect(200);
    expect(res.body).toMatchObject({ name: null, email: null, phone: null });
    expect(res.body.erasedAt).not.toBeNull();
    const booking = await t.prisma.booking.findFirstOrThrow({ where: { customerId: id } });
    expect(booking.serviceName).toBe('Assessment');
    const audit = await t.prisma.auditLog.findFirstOrThrow({ where: { entityId: id, action: 'customer.erased' } });
    expect(JSON.stringify(audit)).not.toMatch(/example\.test|Test Customer/);
  });

  it('is refused while the customer still has an upcoming booking', async () => {
    const c = customer('upcoming');
    await publicBook(t, a.slug, { serviceId: a.serviceId, staffId: 'any', startsAt: ukTime(10, '09:00'), customer: c }).expect(201);
    const row = await t.prisma.customer.findFirstOrThrow({ where: { emailNormalized: c.email } });
    await as(t, a).post(`/api/v1/customers/${row.id}/erase`).expect(409);
  });

  it("is owner-only and tenant-scoped: staff 403, API key 403, another business 404", async () => {
    const id = await pastCustomer(a, 2);
    await as(t, aStaff).post(`/api/v1/customers/${id}/erase`).expect(403);
    await as(t, aStaff).get('/api/v1/customers').expect(403);
    const key = (await as(t, a).post('/api/v1/api-keys', { name: 'k' }).expect(201)).body.key;
    await t.http.post(`/api/v1/customers/${id}/erase`).set('Authorization', `Bearer ${key}`).expect(403);
    await as(t, b).post(`/api/v1/customers/${id}/erase`).expect(404);
    expect((await t.prisma.customer.findUniqueOrThrow({ where: { id } })).erasedAt).toBeNull();
    const list = await as(t, b).get('/api/v1/customers?limit=100').expect(200);
    expect(list.body.items.map((x: { id: string }) => x.id)).not.toContain(id);
  });
});

describe('daily clean-up', () => {
  it('erases customers past the retention period, keeps recent ones, and drops old idempotency keys', async () => {
    const old = await pastCustomer(b, 25); // default retention: 24 months
    const recent = await pastCustomer(b, 3);
    await t.prisma.idempotencyKey.create({
      data: { businessId: b.businessId, key: 'old-key-123', requestHash: 'x', responseStatus: 201, responseJson: {}, createdAt: new Date(Date.now() - 2 * 86_400_000) },
    });
    const cleanup = new CleanupService(t.prisma, t.app.get(AuditService));
    const report = await cleanup.run();
    expect(report.customersErased).toBeGreaterThanOrEqual(1);
    expect((await t.prisma.customer.findUniqueOrThrow({ where: { id: old } })).erasedAt).not.toBeNull();
    expect((await t.prisma.customer.findUniqueOrThrow({ where: { id: recent } })).erasedAt).toBeNull();
    expect(await t.prisma.idempotencyKey.count({ where: { key: 'old-key-123' } })).toBe(0);
    const audit = await t.prisma.auditLog.findFirstOrThrow({ where: { entityId: old } });
    expect(audit.actorType).toBe('system');
  });
});

describe('demo business', () => {
  let demo: { cookie: string };

  beforeAll(async () => {
    await seedDemo(t.prisma, config.MANAGE_TOKEN_SECRET, Temporal.Now.instant());
    const res = await t.http.post('/api/v1/auth/login').set('Origin', ORIGIN).send({ email: DEMO_EMAIL, password: DEMO_PASSWORD }).expect(200);
    demo = { cookie: cookiesOf(res) };
  });

  it('is seeded live, with bookings, and its public login works', async () => {
    const me = await as(t, demo).get('/api/v1/auth/me').expect(200);
    expect(me.body.business).toMatchObject({ slug: DEMO_SLUG, isDemo: true, live: true });
    await t.http.get(`/api/v1/public/${DEMO_SLUG}`).expect(200);
    expect(await t.prisma.booking.count({ where: { business: { slug: DEMO_SLUG } } })).toBeGreaterThan(5);
  });

  it("can't create API keys, webhooks or invites, or change its web address", async () => {
    await as(t, demo).post('/api/v1/api-keys', { name: 'x' }).expect(403);
    await as(t, demo).post('/api/v1/webhooks', { url: 'https://example.com/h' }).expect(403);
    const staff = await as(t, demo).post('/api/v1/staff', { displayName: 'Temp' }).expect(201);
    const invite = await as(t, demo).post(`/api/v1/staff/${staff.body.id}/invite`, { email: 'someone@example.test' }).expect(403);
    expect(invite.body.errorCode).toBe('DEMO_RESTRICTED');
    await as(t, demo).patch('/api/v1/business', { slug: 'taken-over' }).expect(403);
  });

  it('never sends email (booking emails are skipped; password reset does nothing)', async () => {
    const booking = await t.prisma.booking.findFirstOrThrow({ where: { business: { slug: DEMO_SLUG } } });
    const mail = new MailService(config);
    const sender = new BookingEmailSender(config, t.prisma, mail);
    expect(await sender.send({ type: 'booking', kind: 'confirmation', bookingId: booking.id, version: booking.version })).toBe('skipped');
    expect(mail.outbox).toHaveLength(0);
    const before = await t.prisma.outboxEvent.count();
    await t.http.post('/api/v1/auth/forgot-password').set('Origin', ORIGIN).send({ email: DEMO_EMAIL }).expect(200);
    expect(await t.prisma.outboxEvent.count()).toBe(before);
  });

  it('re-seeding resets it (nightly job)', async () => {
    await as(t, demo).patch('/api/v1/business', { name: 'Vandalised' }).expect(200);
    await seedDemo(t.prisma, config.MANAGE_TOKEN_SECRET);
    expect((await t.prisma.business.findUniqueOrThrow({ where: { slug: DEMO_SLUG } })).name).toBe('Demo Physio Clinic');
  });
});
