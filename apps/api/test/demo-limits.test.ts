import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEMO_LIMITS } from '../src/common/demo-limits.js';
import { uuidv7 } from '../src/common/ids.js';
import { APP_CONFIG, type AppConfig } from '../src/config.js';
import { PublicCache } from '../src/business/public-cache.js';
import { DEMO_EMAIL, DEMO_PASSWORD, DEMO_SLUG, reseedDemo, seedDemo } from '../src/demo/seed.js';
import { schedulesFor } from '../src/jobs/maintenance.processor.js';
import { customer, publicBook } from './booking-helpers.js';
import { as, cookiesOf, nextIp, ORIGIN, registerOwner, resetDb, startApp, type TestApp } from './helpers.js';

// A public demo must not be fillable between resets: demo businesses are capped (403 DEMO_LIMIT).
let t: TestApp;
let config: AppConfig;
let demo: { id: string };
beforeAll(async () => {
  t = await startApp({ PUBLIC_DEMO: 'true' });
  config = t.app.get(APP_CONFIG);
});
afterAll(() => t.close());
beforeEach(async () => {
  await resetDb(t.prisma);
  await seedDemo(t.prisma, config.MANAGE_TOKEN_SECRET);
  await t.app.get(PublicCache).forget(DEMO_SLUG);
  const business = await t.prisma.business.findUniqueOrThrow({ where: { slug: DEMO_SLUG } });
  demo = { id: business.id };
});

/** The demo owner's session (login is rate-limited per email, so only the tests that need it log in). */
const demoOwner = async () => {
  const login = await t.http
    .post('/api/v1/auth/login')
    .set('Origin', ORIGIN)
    .set('X-Forwarded-For', nextIp())
    .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
    .expect(200);
  return { cookie: cookiesOf(login) };
};

const expectDemoLimit = (res: { body: { statusCode: number; errorCode: string } }) =>
  expect(res.body).toMatchObject({ statusCode: 403, errorCode: 'DEMO_LIMIT' });

/** A bookable slot on the demo clinic, from the public availability endpoint. */
const demoSlot = async () => {
  const biz = await t.http.get(`/api/v1/public/${DEMO_SLUG}`).expect(200);
  const serviceId = biz.body.services[0].id as string;
  const from = new Date().toISOString().slice(0, 10);
  const to = new Date(Date.now() + 13 * 86_400_000).toISOString().slice(0, 10);
  const av = await t.http.get(`/api/v1/public/${DEMO_SLUG}/availability`).query({ serviceId, from, to }).expect(200);
  const slot = (av.body.days as { slots: { startsAt: string }[] }[]).flatMap((d) => d.slots)[0]!;
  return { serviceId, staffId: 'any', startsAt: slot.startsAt };
};

/** Pads the demo with cancelled copies of a seeded booking (cancelled rows don't hit the overlap constraint). */
const padBookings = async (total: number) => {
  const template = await t.prisma.booking.findFirstOrThrow({ where: { businessId: demo.id } });
  const have = await t.prisma.booking.count({ where: { businessId: demo.id } });
  await t.prisma.booking.createMany({
    data: Array.from({ length: total - have }, () => ({
      ...template,
      id: uuidv7(),
      status: 'cancelled' as const,
      cancelledAt: new Date(),
      manageTokenHash: uuidv7(),
      createdAt: undefined,
      updatedAt: undefined,
    })),
  });
};

describe('demo business caps', () => {
  it(`services: the ${DEMO_LIMITS.services + 1}th returns 403 DEMO_LIMIT`, async () => {
    const have = await t.prisma.service.count({ where: { businessId: demo.id } });
    await t.prisma.service.createMany({
      data: Array.from({ length: DEMO_LIMITS.services - have }, (_, i) => ({ businessId: demo.id, name: `Extra ${i}`, durationMin: 30 })),
    });
    expectDemoLimit(await as(t, await demoOwner()).post('/api/v1/services', { name: 'One too many', durationMin: 30 }).expect(403));
    expect(await t.prisma.service.count({ where: { businessId: demo.id } })).toBe(DEMO_LIMITS.services);
  });

  it(`staff: the ${DEMO_LIMITS.staff + 1}th returns 403 DEMO_LIMIT`, async () => {
    const have = await t.prisma.staff.count({ where: { businessId: demo.id } });
    await t.prisma.staff.createMany({
      data: Array.from({ length: DEMO_LIMITS.staff - have }, (_, i) => ({ businessId: demo.id, displayName: `Extra ${i}` })),
    });
    expectDemoLimit(await as(t, await demoOwner()).post('/api/v1/staff', { displayName: 'One too many' }).expect(403));
  });

  it(`bookings: at ${DEMO_LIMITS.bookings} rows, a public booking returns 403 DEMO_LIMIT`, async () => {
    await padBookings(DEMO_LIMITS.bookings);
    const res = await publicBook(t, DEMO_SLUG, { ...(await demoSlot()), customer: customer('cap') }).expect(403);
    expectDemoLimit(res);
    expect(await t.prisma.booking.count({ where: { businessId: demo.id } })).toBe(DEMO_LIMITS.bookings);
  });

  it(`customers: at ${DEMO_LIMITS.customers}, a new customer is refused but a returning one can still book`, async () => {
    const have = await t.prisma.customer.count({ where: { businessId: demo.id } });
    await t.prisma.customer.createMany({
      data: Array.from({ length: DEMO_LIMITS.customers - have }, (_, i) => {
        const email = `pad-${i}@example.test`;
        return { businessId: demo.id, name: `Pad ${i}`, email, emailNormalized: email };
      }),
    });
    const slot = await demoSlot();
    expectDemoLimit(await publicBook(t, DEMO_SLUG, { ...slot, customer: customer('new') }).expect(403));
    const returning = { name: 'Pad 0', email: 'pad-0@example.test', phone: '07700 900000' };
    await publicBook(t, DEMO_SLUG, { ...slot, customer: returning }).expect(201);
    expect(await t.prisma.customer.count({ where: { businessId: demo.id } })).toBe(DEMO_LIMITS.customers);
  });

  it('a real (non-demo) business has no caps', async () => {
    const owner = await registerOwnerOnNormalApp();
    await t.prisma.service.createMany({
      data: Array.from({ length: DEMO_LIMITS.services }, (_, i) => ({ businessId: owner.businessId, name: `S ${i}`, durationMin: 30 })),
    });
    await as(t, owner).post('/api/v1/services', { name: 'Still fine', durationMin: 30 }).expect(201);
  });
});

describe('demo reseed', () => {
  it('clears the cached public profile, so the widget never offers the old service ids', async () => {
    const before = await t.http.get(`/api/v1/public/${DEMO_SLUG}`).expect(200); // now cached
    await reseedDemo(t.prisma, config.MANAGE_TOKEN_SECRET, t.app.get(PublicCache));
    const after = await t.http.get(`/api/v1/public/${DEMO_SLUG}`).expect(200);
    const fresh = await t.prisma.service.findMany({ where: { business: { slug: DEMO_SLUG } }, select: { id: true } });
    expect(after.body.services[0].id).not.toBe(before.body.services[0].id);
    expect(fresh.map((s) => s.id)).toContain(after.body.services[0].id);
  });

  it('resets every hour on a public demo, nightly otherwise', () => {
    const reseed = (publicDemo: boolean) => schedulesFor({ PUBLIC_DEMO: publicDemo }).find((s) => s.name === 'demo-reseed')!.repeat;
    expect(reseed(true)).toEqual({ pattern: '0 * * * *', tz: 'Europe/London' });
    expect(reseed(false)).toEqual({ pattern: '0 4 * * *', tz: 'Europe/London' });
  });
});

/** Sign-up is off on a public demo, so the real business is created by a second app with PUBLIC_DEMO off. */
async function registerOwnerOnNormalApp() {
  const normal = await startApp({ PUBLIC_DEMO: 'false' });
  try {
    return await registerOwner(normal);
  } finally {
    await normal.close();
  }
}
