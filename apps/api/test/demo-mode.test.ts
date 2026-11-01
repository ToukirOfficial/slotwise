import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { APP_CONFIG, type AppConfig } from '../src/config.js';
import { DEMO_EMAIL, DEMO_PASSWORD, seedDemo } from '../src/demo/seed.js';
import { MailService } from '../src/mail/mail.service.js';
import { cookiesOf, makeAuthToken, nextIp, ORIGIN, resetDb, startApp, type TestApp, uniqueEmail } from './helpers.js';

// PUBLIC_DEMO=true: the public portfolio demo. Accounts can't be created or taken over, and no email leaves.
let t: TestApp;
let config: AppConfig;
beforeAll(async () => {
  t = await startApp({ PUBLIC_DEMO: 'true' });
  config = t.app.get(APP_CONFIG);
});
afterAll(() => t.close());
beforeEach(() => resetDb(t.prisma));

const post = (url: string, body: object) =>
  t.http.post(url).set('Origin', ORIGIN).set('X-Forwarded-For', nextIp()).send(body);

const expectDemoMode = (res: { body: { statusCode: number; errorCode: string } }) =>
  expect(res.body).toMatchObject({ statusCode: 403, errorCode: 'DEMO_MODE' });

const demoUserId = async () => (await t.prisma.user.findUniqueOrThrow({ where: { email: DEMO_EMAIL } })).id;

describe('PUBLIC_DEMO=true', () => {
  it('sign-up returns 403 DEMO_MODE and creates nothing', async () => {
    const email = uniqueEmail('owner');
    const res = await post('/api/v1/auth/register', {
      businessName: 'Should Not Exist',
      name: 'Owner Person',
      email,
      password: 'correct-horse-battery',
    }).expect(403);
    expectDemoMode(res);
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(await t.prisma.user.count({ where: { email } })).toBe(0);
    expect(await t.prisma.business.count()).toBe(0);
  });

  it('invite acceptance returns 403 DEMO_MODE, even with a valid token, and leaves the token unused', async () => {
    await seedDemo(t.prisma, config.MANAGE_TOKEN_SECRET);
    const token = await makeAuthToken(t, await demoUserId(), 'staff_invite');
    const res = await post('/api/v1/auth/accept-invite', { token, password: 'staff-password-123' }).expect(403);
    expectDemoMode(res);
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(await t.prisma.authToken.count({ where: { usedAt: null } })).toBe(1);
  });

  it('forgot-password returns 403 DEMO_MODE and creates no reset token', async () => {
    await seedDemo(t.prisma, config.MANAGE_TOKEN_SECRET);
    expectDemoMode(await post('/api/v1/auth/forgot-password', { email: DEMO_EMAIL }).expect(403));
    expect(await t.prisma.authToken.count()).toBe(0);
  });

  it('reset-password returns 403 DEMO_MODE, even with a valid token, and keeps the demo password', async () => {
    await seedDemo(t.prisma, config.MANAGE_TOKEN_SECRET);
    const token = await makeAuthToken(t, await demoUserId(), 'reset_password');
    expectDemoMode(await post('/api/v1/auth/reset-password', { token, password: 'taken-over-123' }).expect(403));
    await post('/api/v1/auth/login', { email: DEMO_EMAIL, password: DEMO_PASSWORD }).expect(200);
  });

  it('the demo login still works and opens the demo clinic', async () => {
    await seedDemo(t.prisma, config.MANAGE_TOKEN_SECRET);
    const res = await post('/api/v1/auth/login', { email: DEMO_EMAIL, password: DEMO_PASSWORD }).expect(200);
    expect(res.body.business).toMatchObject({ slug: 'demo-physio', isDemo: true });
    await t.http.get('/api/v1/auth/me').set('Cookie', cookiesOf(res)).expect(200);
  });

  it('never uses SMTP, even when SMTP_URL is set', async () => {
    // Port 1 refuses connections: if the demo mailer tried SMTP, send() would throw.
    const mail = new MailService({ ...config, SMTP_URL: 'smtp://127.0.0.1:1' });
    await expect(mail.send({ to: 'someone@example.com', subject: 'Hi', text: 'Hi', html: '<p>Hi</p>' }, 'test')).resolves.toBeUndefined();
  });
});

describe('PUBLIC_DEMO=false (the default)', () => {
  it('sign-up still works', async () => {
    const normal = await startApp({ PUBLIC_DEMO: 'false' });
    try {
      expect(normal.app.get<AppConfig>(APP_CONFIG).PUBLIC_DEMO).toBe(false);
      await normal.http
        .post('/api/v1/auth/register')
        .set('Origin', ORIGIN)
        .set('X-Forwarded-For', nextIp())
        .send({ businessName: 'Normal Clinic', name: 'Owner Person', email: uniqueEmail('owner'), password: 'correct-horse-battery' })
        .expect(201);
    } finally {
      await normal.close();
    }
  });
});
