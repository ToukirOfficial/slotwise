import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from '../src/bootstrap.js';
import { sha256 } from '../src/common/crypto.js';
import { loadConfig } from '../src/config.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

export const ORIGIN = 'http://localhost:8015';

export interface TestApp {
  app: INestApplication;
  prisma: PrismaService;
  http: ReturnType<typeof request>;
  close: () => Promise<void>;
}

export const startApp = async (): Promise<TestApp> => {
  const app = await createApp(loadConfig());
  await app.init();
  const prisma = app.get(PrismaService);
  return { app, prisma, http: request(app.getHttpServer()), close: () => app.close() };
};

/** Empties every table (fast, keeps the schema). */
export const resetDb = async (prisma: PrismaService): Promise<void> => {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) {
    await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`);
  }
};

/** Cookie header from a response's Set-Cookie (supertest won't send Secure cookies over plain http). */
export const cookiesOf = (res: { headers: Record<string, unknown> }): string => {
  const set = (res.headers['set-cookie'] ?? []) as string[];
  return set
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');
};

export const cookieValue = (cookie: string, name: string): string | undefined =>
  cookie
    .split('; ')
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1);

let seq = 0;
/** A different client IP per call (the API trusts X-Forwarded-For from loopback, i.e. nginx). */
export const nextIp = () => `10.0.${Math.floor(++seq / 250) % 250}.${seq % 250}`;
export const uniqueEmail = (tag = 'user') => `${tag}-${Date.now()}-${++seq}@example.test`;

export interface Session {
  cookie: string;
  userId: string;
  businessId: string;
  staffId: string;
}

/** Registers a new business and returns the owner's session. */
export const registerOwner = async (t: TestApp, name = 'Clinic'): Promise<Session & { email: string }> => {
  const email = uniqueEmail('owner');
  const res = await t.http
    .post('/api/v1/auth/register')
    .set('Origin', ORIGIN)
    .set('X-Forwarded-For', nextIp()) // register is rate-limited per IP
    .send({ businessName: `${name} ${++seq}`, name: 'Owner Person', email, password: 'correct-horse-battery' })
    .expect(201);
  return {
    cookie: cookiesOf(res),
    userId: res.body.user.id,
    businessId: res.body.business.id,
    staffId: res.body.user.staffId,
    email,
  };
};

/** Marks a business live (as if the owner clicked the verification link). */
export const verifyBusiness = (t: TestApp, businessId: string) =>
  t.prisma.business.update({ where: { id: businessId }, data: { verifiedAt: new Date() } });

/** Creates a single-use auth token directly (the worker normally creates and emails it). */
export const makeAuthToken = async (
  t: TestApp,
  userId: string,
  kind: 'verify_email' | 'reset_password' | 'staff_invite',
): Promise<string> => {
  const token = `tok${Date.now()}${Math.random().toString(36).slice(2)}abcdefghijkl`;
  await t.prisma.authToken.create({
    data: { userId, kind, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 3600_000) },
  });
  return token;
};

/** Adds a staff member with a staff-role login to the business and returns their session. */
export const addStaffLogin = async (t: TestApp, owner: Session): Promise<Session> => {
  const created = await t.http
    .post('/api/v1/staff')
    .set('Origin', ORIGIN)
    .set('Cookie', owner.cookie)
    .send({ displayName: 'Staff Person' })
    .expect(201);
  const email = uniqueEmail('staff');
  await t.http
    .post(`/api/v1/staff/${created.body.id}/invite`)
    .set('Origin', ORIGIN)
    .set('Cookie', owner.cookie)
    .send({ email })
    .expect(200);
  const user = await t.prisma.user.findUniqueOrThrow({ where: { email } });
  const token = await makeAuthToken(t, user.id, 'staff_invite');
  const res = await t.http
    .post('/api/v1/auth/accept-invite')
    .set('Origin', ORIGIN)
    .send({ token, password: 'staff-password-123' })
    .expect(200);
  return { cookie: cookiesOf(res), userId: user.id, businessId: owner.businessId, staffId: created.body.id };
};

/** Shorthand for an authenticated dashboard request. */
export const as = (t: TestApp, s: { cookie: string }) => ({
  get: (url: string) => t.http.get(url).set('Cookie', s.cookie),
  post: (url: string, body: object = {}) => t.http.post(url).set('Origin', ORIGIN).set('Cookie', s.cookie).send(body),
  patch: (url: string, body: object = {}) => t.http.patch(url).set('Origin', ORIGIN).set('Cookie', s.cookie).send(body),
  put: (url: string, body: object = {}) => t.http.put(url).set('Origin', ORIGIN).set('Cookie', s.cookie).send(body),
  delete: (url: string) => t.http.delete(url).set('Origin', ORIGIN).set('Cookie', s.cookie),
});
