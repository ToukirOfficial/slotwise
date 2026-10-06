import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type BookableBusiness, bookableBusiness, customer, key, publicBook, ukTime } from './booking-helpers.js';
import { ORIGIN, resetDb, startApp, type TestApp } from './helpers.js';

let t: TestApp;
let biz: BookableBusiness;

beforeAll(async () => {
  t = await startApp();
  await resetDb(t.prisma);
  biz = await bookableBusiness(t);
});
afterAll(() => t.close());

const body = (hhmm: string, day = 10) => ({
  serviceId: biz.serviceId,
  staffId: 'any',
  startsAt: ukTime(day, hhmm),
  customer: customer(),
});

describe('Idempotency-Key on booking create', () => {
  it('is required', async () => {
    const res = await publicBook(t, biz.slug, body('09:00'), null).expect(400);
    expect(res.body.errorCode).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('same key twice → one booking and the same response (the "double-click")', async () => {
    const k = key();
    const b = body('10:00');
    const first = await publicBook(t, biz.slug, b, k).expect(201);
    const second = await publicBook(t, biz.slug, b, k).expect(201);
    expect(second.body).toEqual(first.body);
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(await t.prisma.booking.count({ where: { startsAt: new Date(b.startsAt) } })).toBe(1);
    // The stored response holds the booking id only: customer details live in `customers` alone.
    const stored = await t.prisma.idempotencyKey.findFirstOrThrow({ where: { key: k } });
    expect(Object.keys(stored.responseJson as object)).toEqual(['bookingId']);
  });

  it('same key with a different body → 422 IDEMPOTENCY_KEY_REUSED', async () => {
    const k = key();
    await publicBook(t, biz.slug, body('11:00'), k).expect(201);
    const res = await publicBook(t, biz.slug, body('12:00'), k).expect(422);
    expect(res.body.errorCode).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('concurrent requests with the same key create exactly one booking and all get the same answer', async () => {
    const k = key();
    const b = body('13:00');
    const results = await Promise.all(Array.from({ length: 10 }, () => publicBook(t, biz.slug, b, k)));
    expect(results.every((r) => r.status === 201)).toBe(true);
    expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
    expect(await t.prisma.booking.count({ where: { startsAt: new Date(b.startsAt) } })).toBe(1);
  });

  it('a failed attempt (409) leaves no key behind, so a retry with the same key is a genuine new attempt', async () => {
    const taken = body('14:00');
    await publicBook(t, biz.slug, taken, key()).expect(201);
    const k = key();
    const retryBody = { ...body('14:00'), startsAt: taken.startsAt };
    await publicBook(t, biz.slug, retryBody, k).expect(409);
    expect(await t.prisma.idempotencyKey.count({ where: { key: k } })).toBe(0);
    // The slot frees up (cancelled), and the same key now succeeds.
    const existing = await t.prisma.booking.findFirstOrThrow({ where: { startsAt: new Date(taken.startsAt) } });
    await t.prisma.booking.update({ where: { id: existing.id }, data: { status: 'cancelled' } });
    await publicBook(t, biz.slug, retryBody, k).expect(201);
  });

  it('keys are per business: the same key at another business is independent', async () => {
    const other = await bookableBusiness(t, 'Other');
    const k = key();
    await publicBook(t, biz.slug, body('15:00'), k).expect(201);
    await publicBook(t, other.slug, { ...body('15:00'), serviceId: other.serviceId }, k).expect(201);
  });
});

describe('Idempotency-Key on reschedule', () => {
  it('replays the first result and never moves the booking twice', async () => {
    const created = await publicBook(t, biz.slug, body('09:00', 20), key()).expect(201);
    const k = key();
    const move = () =>
      t.http
        .post(`/api/v1/bookings/${created.body.id}/reschedule`)
        .set('Origin', ORIGIN)
        .set('Cookie', biz.cookie)
        .set('Idempotency-Key', k)
        .send({ startsAt: ukTime(20, '10:00') });
    const first = await move().expect(200);
    const second = await move().expect(200);
    expect(second.body).toEqual(first.body);
    const row = await t.prisma.booking.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(row.version).toBe(2);
  });
});
