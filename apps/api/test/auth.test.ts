import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { as, cookiesOf, cookieValue, makeAuthToken, ORIGIN, registerOwner, resetDb, startApp, type TestApp } from './helpers.js';

let t: TestApp;
beforeAll(async () => {
  t = await startApp();
});
afterAll(() => t.close());
beforeEach(() => resetDb(t.prisma));

const login = (email: string, password: string) =>
  t.http.post('/api/v1/auth/login').set('Origin', ORIGIN).send({ email, password });
const refresh = (cookie: string) => t.http.post('/api/v1/auth/refresh').set('Origin', ORIGIN).set('Cookie', cookie);

describe('login', () => {
  it('logs in with the right password and sets httpOnly Secure SameSite=Lax cookies', async () => {
    const owner = await registerOwner(t);
    const res = await login(owner.email, 'correct-horse-battery').expect(200);
    expect(res.body.user.email).toBe(owner.email);
    const setCookie = (res.headers['set-cookie'] as unknown as string[]).join('\n');
    expect(setCookie).toMatch(/sw_access=.*HttpOnly/);
    expect(setCookie).toMatch(/sw_access=.*Secure/);
    expect(setCookie).toMatch(/sw_access=.*SameSite=Lax/);
    expect(setCookie).toMatch(/sw_refresh=.*Path=\/api\/v1\/auth/);
    await as(t, { cookie: cookiesOf(res) }).get('/api/v1/auth/me').expect(200);
  });

  it('rejects a wrong password and an unknown email with the same error', async () => {
    const owner = await registerOwner(t);
    const wrong = await login(owner.email, 'not-the-password').expect(401);
    const unknown = await login('nobody@example.test', 'whatever-123').expect(401);
    expect(wrong.body.errorCode).toBe('INVALID_CREDENTIALS');
    expect(unknown.body).toEqual(wrong.body);
  });

  it('rate-limits login per email: the 6th attempt in a minute gets 429 with Retry-After', async () => {
    const owner = await registerOwner(t);
    for (let i = 0; i < 5; i++) await login(owner.email, 'wrong-password-x').expect(401);
    const res = await login(owner.email, 'correct-horse-battery').expect(429);
    expect(res.body.errorCode).toBe('RATE_LIMITED');
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('refuses requests without a session, and writes from another origin', async () => {
    await t.http.get('/api/v1/auth/me').expect(401);
    const owner = await registerOwner(t);
    const res = await t.http
      .patch('/api/v1/business')
      .set('Origin', 'https://evil.example')
      .set('Cookie', owner.cookie)
      .send({ name: 'Hacked' })
      .expect(403);
    expect(res.body.errorCode).toBe('BAD_ORIGIN');
  });
});

describe('refresh tokens', () => {
  it('rotates: the new refresh token works and the access token is replaced', async () => {
    const owner = await registerOwner(t);
    const first = await refresh(owner.cookie).expect(200);
    const rotated = cookiesOf(first);
    expect(cookieValue(rotated, 'sw_refresh')).not.toBe(cookieValue(owner.cookie, 'sw_refresh'));
    await refresh(rotated).expect(200);
  });

  it('reusing an already-rotated refresh token revokes the whole family', async () => {
    const owner = await registerOwner(t);
    const rotated = cookiesOf(await refresh(owner.cookie).expect(200));

    // The old token is presented again (e.g. stolen): rejected…
    const reuse = await refresh(owner.cookie).expect(401);
    expect(reuse.body.errorCode).toBe('SESSION_EXPIRED');
    // …and the legitimate holder's newer token is now dead too.
    await refresh(rotated).expect(401);
    const live = await t.prisma.session.count({ where: { userId: owner.userId, revokedAt: null } });
    expect(live).toBe(0);
  });

  it('logout revokes the family', async () => {
    const owner = await registerOwner(t);
    await t.http.post('/api/v1/auth/logout').set('Origin', ORIGIN).set('Cookie', owner.cookie).expect(200);
    await refresh(owner.cookie).expect(401);
  });
});

describe('email tokens', () => {
  it('verifying the owner email makes the business live; the link works once', async () => {
    const owner = await registerOwner(t);
    const token = await makeAuthToken(t, owner.userId, 'verify_email');
    await t.http.post('/api/v1/auth/verify-email').set('Origin', ORIGIN).send({ token }).expect(200);
    const me = await as(t, owner).get('/api/v1/auth/me').expect(200);
    expect(me.body.business.live).toBe(true);
    const again = await t.http.post('/api/v1/auth/verify-email').set('Origin', ORIGIN).send({ token }).expect(400);
    expect(again.body.errorCode).toBe('TOKEN_INVALID');
  });

  it('password reset changes the password once and logs out every session', async () => {
    const owner = await registerOwner(t);
    const token = await makeAuthToken(t, owner.userId, 'reset_password');
    await t.http
      .post('/api/v1/auth/reset-password')
      .set('Origin', ORIGIN)
      .send({ token, password: 'a-brand-new-password' })
      .expect(200);
    await refresh(owner.cookie).expect(401);
    await login(owner.email, 'correct-horse-battery').expect(401);
    await login(owner.email, 'a-brand-new-password').expect(200);
    await t.http
      .post('/api/v1/auth/reset-password')
      .set('Origin', ORIGIN)
      .send({ token, password: 'another-password-1' })
      .expect(400);
  });

  it('a verify token cannot be used as a reset token', async () => {
    const owner = await registerOwner(t);
    const token = await makeAuthToken(t, owner.userId, 'verify_email');
    await t.http
      .post('/api/v1/auth/reset-password')
      .set('Origin', ORIGIN)
      .send({ token, password: 'a-brand-new-password' })
      .expect(400);
  });
});
