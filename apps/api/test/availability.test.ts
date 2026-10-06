import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addStaffLogin, as, registerOwner, resetDb, type Session, startApp, type TestApp, verifyBusiness } from './helpers.js';

let t: TestApp;
let a: Session;
let b: Session;
let aStaff: Session;
let slug: string;
let serviceId: string;
let bServiceId: string;

const nextMonday = () => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7) + 7);
  return d.toISOString().slice(0, 10);
};

beforeAll(async () => {
  t = await startApp();
  await resetDb(t.prisma);
  a = await registerOwner(t, 'Business A');
  b = await registerOwner(t, 'Business B');
  aStaff = await addStaffLogin(t, a);
  slug = (await as(t, a).get('/api/v1/auth/me')).body.business.slug;
  serviceId = (await as(t, a).post('/api/v1/services', { name: 'Physio', durationMin: 60 }).expect(201)).body.id;
  bServiceId = (await as(t, b).post('/api/v1/services', { name: 'Other', durationMin: 60 }).expect(201)).body.id;
  for (const staffId of [a.staffId, aStaff.staffId]) {
    await as(t, a).put(`/api/v1/staff/${staffId}/services`, { serviceIds: [serviceId] }).expect(200);
    await as(t, a)
      .put(`/api/v1/staff/${staffId}/weekly-hours`, { hours: [{ weekday: 1, startMin: 540, endMin: 720 }] })
      .expect(200);
  }
});
afterAll(() => t.close());

describe('public endpoints', () => {
  it('return 404 until the owner has verified their email', async () => {
    await t.http.get(`/api/v1/public/${slug}`).expect(404);
    const day = nextMonday();
    await t.http.get(`/api/v1/public/${slug}/availability?serviceId=${serviceId}&from=${day}&to=${day}`).expect(404);
  });

  it('once live, show the business, its bookable services and free times (UTC + UK label)', async () => {
    await verifyBusiness(t, a.businessId);
    const profile = await t.http.get(`/api/v1/public/${slug}`).expect(200);
    expect(profile.body.services.map((s: { name: string }) => s.name)).toEqual(['Physio']);
    const day = nextMonday();
    const res = await t.http
      .get(`/api/v1/public/${slug}/availability?serviceId=${serviceId}&from=${day}&to=${day}`)
      .set('Origin', 'https://customer-site.example')
      .expect(200);
    expect(res.headers['access-control-allow-origin']).toBe('*');
    const times = res.body.days[0].slots.map((s: { localTime: string }) => s.localTime);
    // 09:00–12:00, 60-minute service, default 15-minute step: 09:00 … 11:00
    expect(times[0]).toBe('09:00');
    expect(times.at(-1)).toBe('11:00');
    expect(times).toHaveLength(9);
    expect(res.body.days[0].slots[0].startsAt).toMatch(/Z$/);
  });

  it("never reveal another business's service through a live business's slug", async () => {
    const day = nextMonday();
    await t.http.get(`/api/v1/public/${slug}/availability?serviceId=${bServiceId}&from=${day}&to=${day}`).expect(404);
  });

  it('reject ranges over 60 days', async () => {
    const res = await t.http
      .get(`/api/v1/public/${slug}/availability?serviceId=${serviceId}&from=2030-01-01&to=2030-03-15`)
      .expect(400);
    expect(res.body.errorCode).toBe('VALIDATION_FAILED');
  });
});

describe('authenticated availability', () => {
  it("staff only see their own diary; a colleague's id is not found", async () => {
    const day = nextMonday();
    const q = `serviceId=${serviceId}&from=${day}&to=${day}`;
    const own = await as(t, aStaff).get(`/api/v1/availability?${q}`).expect(200);
    expect(own.body.staffId).toBe(aStaff.staffId);
    await as(t, aStaff).get(`/api/v1/availability?${q}&staffId=${a.staffId}`).expect(404);
  });

  it("an owner can't query another business's service", async () => {
    const day = nextMonday();
    await as(t, a).get(`/api/v1/availability?serviceId=${bServiceId}&from=${day}&to=${day}`).expect(404);
  });
});
