import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDiary, type BookableBusiness, bookableBusiness, customer, key, publicBook, ukTime } from './booking-helpers.js';
import { addStaffLogin, as, ORIGIN, resetDb, type Session, startApp, type TestApp } from './helpers.js';

let t: TestApp;
let a: BookableBusiness;
let b: BookableBusiness;
let aStaff: Session;
let aOwnerBooking: string;
let aStaffBooking: string;
let bBooking: string;

beforeAll(async () => {
  t = await startApp();
  await resetDb(t.prisma);
  a = await bookableBusiness(t, 'Business A');
  b = await bookableBusiness(t, 'Business B');
  aStaff = await addStaffLogin(t, a);
  await addDiary(t, a, aStaff.staffId, a.serviceId);
  const book = async (biz: BookableBusiness, staffId: string, hhmm: string) =>
    (await publicBook(t, biz.slug, { serviceId: biz.serviceId, staffId, startsAt: ukTime(10, hhmm), customer: customer() }).expect(201))
      .body.id as string;
  aOwnerBooking = await book(a, a.staffId, '09:00');
  aStaffBooking = await book(a, aStaff.staffId, '09:00');
  bBooking = await book(b, b.staffId, '09:00');
});
afterAll(() => t.close());

const reschedule = (s: Session, id: string) =>
  t.http
    .post(`/api/v1/bookings/${id}/reschedule`)
    .set('Origin', ORIGIN)
    .set('Cookie', s.cookie)
    .set('Idempotency-Key', key())
    .send({ startsAt: ukTime(10, '15:00') });

describe('bookings: business isolation', () => {
  it("A cannot read, cancel or reschedule B's booking: 404, and nothing changes", async () => {
    await as(t, a).get(`/api/v1/bookings/${bBooking}`).expect(404);
    await as(t, a).post(`/api/v1/bookings/${bBooking}/cancel`).expect(404);
    await reschedule(a, bBooking).expect(404);
    const row = await t.prisma.booking.findUniqueOrThrow({ where: { id: bBooking } });
    expect(row.status).toBe('confirmed');
    expect(row.version).toBe(1);
  });

  it("A's list never includes B's bookings, even when searching", async () => {
    const res = await as(t, a).get('/api/v1/bookings?limit=100').expect(200);
    const ids = res.body.items.map((x: { id: string }) => x.id);
    expect(ids).toContain(aOwnerBooking);
    expect(ids).not.toContain(bBooking);
    const search = await as(t, a).get('/api/v1/bookings?q=example.test').expect(200);
    expect(search.body.items.map((x: { id: string }) => x.id)).not.toContain(bBooking);
  });

  it("A can't book B's service or B's staff", async () => {
    const res = await t.http
      .post('/api/v1/bookings')
      .set('Origin', ORIGIN)
      .set('Cookie', a.cookie)
      .set('Idempotency-Key', key())
      .send({ serviceId: b.serviceId, staffId: 'any', startsAt: ukTime(11, '09:00'), customer: customer() });
    expect(res.status).toBe(404);
    const res2 = await t.http
      .post('/api/v1/bookings')
      .set('Origin', ORIGIN)
      .set('Cookie', a.cookie)
      .set('Idempotency-Key', key())
      .send({ serviceId: a.serviceId, staffId: b.staffId, startsAt: ukTime(11, '09:00'), customer: customer() });
    expect(res2.status).toBe(404);
  });

  it("A's audit log never shows B's entries", async () => {
    const res = await as(t, a).get('/api/v1/audit-log?limit=100').expect(200);
    expect(res.body.items.map((x: { entityId: string }) => x.entityId)).not.toContain(bBooking);
  });
});

describe('bookings: staff see only their own diary', () => {
  it("staff can't see, cancel or move a colleague's booking", async () => {
    await as(t, aStaff).get(`/api/v1/bookings/${aOwnerBooking}`).expect(404);
    await as(t, aStaff).post(`/api/v1/bookings/${aOwnerBooking}/cancel`).expect(404);
    await reschedule(aStaff, aOwnerBooking).expect(404);
    const list = await as(t, aStaff).get('/api/v1/bookings').expect(200);
    expect(list.body.items.map((x: { id: string }) => x.id)).toEqual([aStaffBooking]);
    const filtered = await as(t, aStaff).get(`/api/v1/bookings?staffId=${a.staffId}`).expect(200);
    expect(filtered.body.items).toEqual([]);
  });

  it("staff can't book into a colleague's diary", async () => {
    const res = await t.http
      .post('/api/v1/bookings')
      .set('Origin', ORIGIN)
      .set('Cookie', aStaff.cookie)
      .set('Idempotency-Key', key())
      .send({ serviceId: a.serviceId, staffId: a.staffId, startsAt: ukTime(12, '09:00'), customer: customer() });
    expect(res.status).toBe(404);
  });

  it('staff can manage their own booking', async () => {
    await as(t, aStaff).get(`/api/v1/bookings/${aStaffBooking}`).expect(200);
    await reschedule(aStaff, aStaffBooking).expect(200);
  });

  it('the audit log is owner-only', async () => {
    await as(t, aStaff).get('/api/v1/audit-log').expect(403);
  });
});

describe('outside working hours flag', () => {
  it('a confirmed booking is flagged once its staff member’s hours no longer cover it', async () => {
    const before = await as(t, a).get(`/api/v1/bookings/${aOwnerBooking}`).expect(200);
    expect(before.body.outsideHours).toBe(false);
    await as(t, a)
      .put(`/api/v1/staff/${a.staffId}/weekly-hours`, {
        hours: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, startMin: 720, endMin: 1020 })),
      })
      .expect(200);
    const after = await as(t, a).get(`/api/v1/bookings/${aOwnerBooking}`).expect(200);
    expect(after.body.outsideHours).toBe(true);
    expect(after.body.status).toBe('confirmed'); // never cancelled automatically
  });
});
