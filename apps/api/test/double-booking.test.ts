import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isSlotConflict } from '../src/bookings/slot-conflict.js';
import { addDiary, type BookableBusiness, bookableBusiness, customer, key, publicBook, ukTime } from './booking-helpers.js';
import { as, ORIGIN, resetDb, startApp, type TestApp } from './helpers.js';

let t: TestApp;
let biz: BookableBusiness;

beforeAll(async () => {
  t = await startApp();
  await resetDb(t.prisma);
  biz = await bookableBusiness(t);
});
afterAll(() => t.close());

describe('double-booking under concurrency', () => {
  it('100 parallel bookings for one slot: exactly 1 succeeds, 99 get 409 SLOT_TAKEN, 1 row exists', async () => {
    const startsAt = ukTime(10, '10:00');
    const results = await Promise.all(
      Array.from({ length: 100 }, () =>
        publicBook(t, biz.slug, { serviceId: biz.serviceId, staffId: 'any', startsAt, customer: customer() }),
      ),
    );
    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(99);
    expect(results.filter((r) => r.status === 409).every((r) => r.body.errorCode === 'SLOT_TAKEN')).toBe(true);
    const rows = await t.prisma.booking.count({ where: { businessId: biz.businessId, startsAt: new Date(startsAt) } });
    expect(rows).toBe(1);
  });

  it('the database error really has the shape isSlotConflict expects (real PostgreSQL, not a mock)', async () => {
    const existing = await t.prisma.booking.findFirstOrThrow({ where: { businessId: biz.businessId } });
    const { id: _id, createdAt: _c, updatedAt: _u, ...copy } = existing;
    const err = await t.prisma.booking
      .create({ data: { ...copy, manageTokenHash: `${existing.manageTokenHash}-copy` } })
      .catch((e: unknown) => e);
    expect(isSlotConflict(err)).toBe(true);
    // A different constraint (unique manage token hash) is not a slot conflict.
    const other = await t.prisma.booking
      .create({ data: { ...copy, status: 'cancelled' } })
      .catch((e: unknown) => e);
    expect(other).toBeInstanceOf(Error);
    expect(isSlotConflict(other)).toBe(false);
  });

  it('"any staff": with two people free, two parallel bookings both succeed on different staff; a third gets 409', async () => {
    const second = await as(t, biz).post('/api/v1/staff', { displayName: 'Second Person' }).expect(201);
    await addDiary(t, biz, second.body.id, biz.serviceId);
    const startsAt = ukTime(11, '14:00');
    const results = await Promise.all(
      [1, 2, 3].map(() => publicBook(t, biz.slug, { serviceId: biz.serviceId, staffId: 'any', startsAt, customer: customer() })),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 201, 409]);
    const rows = await t.prisma.booking.findMany({ where: { businessId: biz.businessId, startsAt: new Date(startsAt) } });
    expect(new Set(rows.map((r) => r.staffId)).size).toBe(2);
  });

  it('buffers count: a booking can start exactly when the previous one ends, but not inside its buffer', async () => {
    const svc = await as(t, biz)
      .post('/api/v1/services', { name: 'With buffer', durationMin: 30, bufferAfterMin: 15 })
      .expect(201);
    await t.prisma.staffService.create({ data: { staffId: biz.staffId, serviceId: svc.body.id } });
    const first = ukTime(12, '09:00');
    await publicBook(t, biz.slug, { serviceId: svc.body.id, staffId: biz.staffId, startsAt: first, customer: customer() }).expect(201);
    // 09:30 is inside the 15-minute buffer after the first booking (which blocks until 09:45).
    const inBuffer = await publicBook(t, biz.slug, {
      serviceId: svc.body.id,
      staffId: biz.staffId,
      startsAt: ukTime(12, '09:30'),
      customer: customer(),
    });
    expect(inBuffer.status).toBe(409);
    await publicBook(t, biz.slug, {
      serviceId: svc.body.id,
      staffId: biz.staffId,
      startsAt: ukTime(12, '09:45'),
      customer: customer(),
    }).expect(201);
  });
});

describe('reschedule', () => {
  it('into a taken slot fails with 409 and leaves the old slot booked', async () => {
    const a = await publicBook(t, biz.slug, {
      serviceId: biz.serviceId,
      staffId: biz.staffId,
      startsAt: ukTime(13, '09:00'),
      customer: customer(),
    }).expect(201);
    await publicBook(t, biz.slug, {
      serviceId: biz.serviceId,
      staffId: biz.staffId,
      startsAt: ukTime(13, '11:00'),
      customer: customer(),
    }).expect(201);
    const res = await t.http
      .post(`/api/v1/bookings/${a.body.id}/reschedule`)
      .set('Origin', ORIGIN)
      .set('Cookie', biz.cookie)
      .set('Idempotency-Key', key())
      .send({ startsAt: ukTime(13, '11:00') });
    expect(res.status).toBe(409);
    expect(res.body.errorCode).toBe('SLOT_TAKEN');
    const row = await t.prisma.booking.findUniqueOrThrow({ where: { id: a.body.id } });
    expect(row.startsAt.toISOString()).toBe(new Date(ukTime(13, '09:00')).toISOString());
    expect(row.version).toBe(1);
  });

  it('to a free slot moves it in one update, bumps the version and frees the old time', async () => {
    const a = await publicBook(t, biz.slug, {
      serviceId: biz.serviceId,
      staffId: biz.staffId,
      startsAt: ukTime(14, '09:00'),
      customer: customer(),
    }).expect(201);
    const res = await t.http
      .post(`/api/v1/bookings/${a.body.id}/reschedule`)
      .set('Origin', ORIGIN)
      .set('Cookie', biz.cookie)
      .set('Idempotency-Key', key())
      .send({ startsAt: ukTime(14, '10:00') })
      .expect(200);
    expect(res.body.version).toBe(2);
    await publicBook(t, biz.slug, {
      serviceId: biz.serviceId,
      staffId: biz.staffId,
      startsAt: ukTime(14, '09:00'),
      customer: customer(),
    }).expect(201);
  });

  it('a cancelled booking frees its slot', async () => {
    const startsAt = ukTime(15, '09:00');
    const a = await publicBook(t, biz.slug, { serviceId: biz.serviceId, staffId: biz.staffId, startsAt, customer: customer() }).expect(201);
    await as(t, biz).post(`/api/v1/bookings/${a.body.id}/cancel`, { reason: 'Customer phoned' }).expect(200);
    await publicBook(t, biz.slug, { serviceId: biz.serviceId, staffId: biz.staffId, startsAt, customer: customer() }).expect(201);
  });
});

describe('server-side validation', () => {
  it('refuses a start that was never offered (off-grid or outside hours) with 422', async () => {
    for (const startsAt of [ukTime(16, '10:07'), ukTime(16, '20:00')]) {
      const res = await publicBook(t, biz.slug, { serviceId: biz.serviceId, staffId: 'any', startsAt, customer: customer() });
      expect(res.status).toBe(422);
      expect(res.body.errorCode).toBe('SLOT_UNAVAILABLE');
    }
  });

  it('limits a customer email to 3 upcoming bookings per business', async () => {
    const c = customer('limit');
    for (const hhmm of ['09:00', '10:00', '11:00']) {
      await publicBook(t, biz.slug, { serviceId: biz.serviceId, staffId: biz.staffId, startsAt: ukTime(17, hhmm), customer: c }).expect(201);
    }
    const res = await publicBook(t, biz.slug, {
      serviceId: biz.serviceId,
      staffId: biz.staffId,
      startsAt: ukTime(17, '12:00'),
      customer: { ...c, email: c.email.toUpperCase() },
    });
    expect(res.status).toBe(409);
    expect(res.body.errorCode).toBe('BOOKING_LIMIT');
  });
});
