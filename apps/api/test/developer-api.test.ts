import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type BookableBusiness, bookableBusiness, customer, key, publicBook, ukTime } from './booking-helpers.js';
import { addStaffLogin, as, resetDb, startApp, type TestApp } from './helpers.js';

let t: TestApp;
let a: BookableBusiness;
let b: BookableBusiness;
let aKey: string;
let bBooking: string;

const withKey = (k: string) => ({
  get: (url: string) => t.http.get(url).set('Authorization', `Bearer ${k}`),
  post: (url: string, body: object = {}, idem?: string) => {
    const r = t.http.post(url).set('Authorization', `Bearer ${k}`);
    return (idem ? r.set('Idempotency-Key', idem) : r).send(body);
  },
});

beforeAll(async () => {
  t = await startApp();
  await resetDb(t.prisma);
  a = await bookableBusiness(t, 'Business A');
  b = await bookableBusiness(t, 'Business B');
  aKey = (await as(t, a).post('/api/v1/api-keys', { name: 'CRM sync' }).expect(201)).body.key;
  bBooking = (
    await publicBook(t, b.slug, { serviceId: b.serviceId, staffId: 'any', startsAt: ukTime(10, '09:00'), customer: customer() }).expect(201)
  ).body.id;
});
afterAll(() => t.close());

describe('API keys', () => {
  it('are shown once and stored as prefix + hash only', async () => {
    expect(aKey).toMatch(/^sw_live_[a-f0-9]{12}_[A-Za-z0-9_-]{43}$/);
    const row = await t.prisma.apiKey.findFirstOrThrow({ where: { businessId: a.businessId } });
    expect(row.keyHash).not.toContain(aKey.split('_').at(-1));
    const list = await as(t, a).get('/api/v1/api-keys').expect(200);
    expect(JSON.stringify(list.body)).not.toContain(aKey);
  });

  it('can list services and staff, read availability, and create, read, cancel and reschedule bookings', async () => {
    await withKey(aKey).get('/api/v1/services').expect(200);
    await withKey(aKey).get('/api/v1/staff').expect(200);
    const day = ukTime(11, '09:00').slice(0, 10);
    await withKey(aKey).get(`/api/v1/availability?serviceId=${a.serviceId}&from=${day}&to=${day}`).expect(200);
    const created = await withKey(aKey)
      .post('/api/v1/bookings', { serviceId: a.serviceId, startsAt: ukTime(11, '09:00'), customer: customer() }, key())
      .expect(201);
    expect(created.body.source).toBe('api');
    await withKey(aKey).get(`/api/v1/bookings/${created.body.id}`).expect(200);
    await withKey(aKey).post(`/api/v1/bookings/${created.body.id}/reschedule`, { startsAt: ukTime(11, '10:00') }, key()).expect(200);
    await withKey(aKey).post(`/api/v1/bookings/${created.body.id}/cancel`).expect(200);
    const audit = await t.prisma.auditLog.findFirstOrThrow({ where: { entityId: created.body.id, action: 'booking.created' } });
    expect(audit.actorType).toBe('api_key');
  });

  it('cannot touch settings, keys, webhooks, staff accounts, customers or the audit log (403)', async () => {
    await withKey(aKey).get('/api/v1/business').expect(403);
    await withKey(aKey).get('/api/v1/api-keys').expect(403);
    await withKey(aKey).post('/api/v1/api-keys', { name: 'x' }).expect(403);
    await withKey(aKey).get('/api/v1/webhooks').expect(403);
    await withKey(aKey).post('/api/v1/staff', { displayName: 'x' }).expect(403);
    await withKey(aKey).post(`/api/v1/staff/${a.staffId}/invite`, { email: 'x@example.test' }).expect(403);
    await withKey(aKey).get(`/api/v1/staff/${a.staffId}/weekly-hours`).expect(403);
    await withKey(aKey).get('/api/v1/audit-log').expect(403);
  });

  it("only ever see their own business: B's booking is 404", async () => {
    await withKey(aKey).get(`/api/v1/bookings/${bBooking}`).expect(404);
    await withKey(aKey).post(`/api/v1/bookings/${bBooking}/cancel`).expect(404);
    const list = await withKey(aKey).get('/api/v1/bookings?limit=100').expect(200);
    expect(list.body.items.map((x: { id: string }) => x.id)).not.toContain(bBooking);
  });

  it('a wrong secret, a malformed key and a revoked key are all 401', async () => {
    const wrong = aKey.slice(0, -4) + 'AAAA';
    await withKey(wrong).get('/api/v1/services').expect(401);
    await withKey('sw_live_nope').get('/api/v1/services').expect(401);
    const extra = (await as(t, a).post('/api/v1/api-keys', { name: 'Old' }).expect(201)).body;
    await withKey(extra.key).get('/api/v1/services').expect(200);
    await as(t, a).delete(`/api/v1/api-keys/${extra.id}`).expect(200);
    await withKey(extra.key).get('/api/v1/services').expect(401);
  });

  it('are rate-limited per key: 60/min, then 429 with Retry-After', async () => {
    const k = (await as(t, a).post('/api/v1/api-keys', { name: 'Busy' }).expect(201)).body.key;
    for (let i = 0; i < 60; i++) await withKey(k).get('/api/v1/services').expect(200);
    const res = await withKey(k).get('/api/v1/services').expect(429);
    expect(res.body.errorCode).toBe('RATE_LIMITED');
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  it("can't be managed by staff, or by another business", async () => {
    const staff = await addStaffLogin(t, a);
    await as(t, staff).get('/api/v1/api-keys').expect(403);
    await as(t, staff).post('/api/v1/api-keys', { name: 'x' }).expect(403);
    const id = (await t.prisma.apiKey.findFirstOrThrow({ where: { businessId: a.businessId } })).id;
    await as(t, b).delete(`/api/v1/api-keys/${id}`).expect(404);
  });

  it('a demo business cannot create API keys or webhooks', async () => {
    await t.prisma.business.update({ where: { id: b.businessId }, data: { isDemo: true } });
    // The demo flag travels in the access token: log in again to pick it up.
    const login = await t.http
      .post('/api/v1/auth/login')
      .set('Origin', 'http://localhost:8015')
      .send({ email: b.email, password: 'correct-horse-battery' })
      .expect(200);
    const cookie = (login.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');
    const res = await as(t, { cookie }).post('/api/v1/api-keys', { name: 'x' }).expect(403);
    expect(res.body.errorCode).toBe('DEMO_RESTRICTED');
    await as(t, { cookie }).post('/api/v1/webhooks', { url: 'https://example.com/hook' }).expect(403);
  });
});
