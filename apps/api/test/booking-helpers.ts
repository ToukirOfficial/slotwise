import { Temporal } from 'temporal-polyfill';
import { as, nextIp, registerOwner, type Session, type TestApp, verifyBusiness } from './helpers.js';

export interface BookableBusiness extends Session {
  email: string;
  slug: string;
  serviceId: string;
}

/** A live business: one 60-minute service delivered by the owner, open 09:00–17:00 every day, no notice. */
export const bookableBusiness = async (t: TestApp, name = 'Clinic'): Promise<BookableBusiness> => {
  const owner = await registerOwner(t, name);
  await verifyBusiness(t, owner.businessId);
  await t.prisma.business.update({ where: { id: owner.businessId }, data: { minNoticeMin: 0, cancelCutoffHours: 0 } });
  const slug = (await as(t, owner).get('/api/v1/auth/me')).body.business.slug as string;
  const serviceId = (await as(t, owner).post('/api/v1/services', { name: 'Assessment', durationMin: 60 }).expect(201)).body
    .id as string;
  await addDiary(t, owner, owner.staffId, serviceId);
  return { ...owner, slug, serviceId };
};

/** Links a staff member to the service and opens their diary 09:00–17:00 every day. */
export const addDiary = async (t: TestApp, owner: Session, staffId: string, serviceId: string) => {
  const current = await as(t, owner).get(`/api/v1/staff/${staffId}`).expect(200);
  await as(t, owner)
    .put(`/api/v1/staff/${staffId}/services`, { serviceIds: [...new Set([...current.body.serviceIds, serviceId])] })
    .expect(200);
  await as(t, owner)
    .put(`/api/v1/staff/${staffId}/weekly-hours`, {
      hours: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, startMin: 540, endMin: 1020 })),
    })
    .expect(200);
};

/** UTC ISO instant of a UK local time `days` from today. */
export const ukTime = (days: number, hhmm: string): string => {
  const date = Temporal.Now.plainDateISO('Europe/London').add({ days });
  const [h, m] = hhmm.split(':').map(Number);
  return date.toPlainDateTime({ hour: h!, minute: m! }).toZonedDateTime('Europe/London').toInstant().toString();
};

let n = 0;
export const customer = (tag = 'c') => ({
  name: 'Test Customer',
  email: `${tag}-${Date.now()}-${++n}@example.test`,
  phone: '07700 900000',
});

export const key = (tag = 'k') => `${tag}-${Date.now()}-${++n}-abcdef`;

/** POST a widget booking from a fresh client IP (the public endpoint is rate-limited per IP). */
export const publicBook = (t: TestApp, slug: string, body: object, idempotencyKey: string | null = key()) => {
  const req = t.http.post(`/api/v1/public/${slug}/bookings`).set('X-Forwarded-For', nextIp());
  return (idempotencyKey ? req.set('Idempotency-Key', idempotencyKey) : req).send(body);
};
