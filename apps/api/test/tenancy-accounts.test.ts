import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addStaffLogin, as, registerOwner, resetDb, type Session, startApp, type TestApp } from './helpers.js';

let t: TestApp;
let a: Session;
let b: Session;
let aStaff: Session;

beforeAll(async () => {
  t = await startApp();
  await resetDb(t.prisma);
  a = await registerOwner(t, 'Business A');
  b = await registerOwner(t, 'Business B');
  aStaff = await addStaffLogin(t, a);
});
afterAll(() => t.close());

describe('business isolation (accounts)', () => {
  it("A cannot read, change, delete or invite B's staff by id: 404, not 403", async () => {
    const id = b.staffId;
    for (const res of [
      await as(t, a).get(`/api/v1/staff/${id}`),
      await as(t, a).patch(`/api/v1/staff/${id}`, { displayName: 'x' }),
      await as(t, a).delete(`/api/v1/staff/${id}`),
      await as(t, a).post(`/api/v1/staff/${id}/invite`, { email: 'someone@example.test' }),
    ]) {
      expect(res.status).toBe(404);
      expect(res.body.errorCode).toBe('NOT_FOUND');
    }
    const still = await t.prisma.staff.findUniqueOrThrow({ where: { id } });
    expect(still.displayName).toBe('Owner Person');
  });

  it("A's staff list contains only A's staff", async () => {
    const res = await as(t, a).get('/api/v1/staff').expect(200);
    const ids = res.body.items.map((s: { id: string }) => s.id);
    expect(ids).toContain(a.staffId);
    expect(ids).not.toContain(b.staffId);
  });

  it('settings always resolve to the caller’s own business (no id in the URL)', async () => {
    const res = await as(t, a).get('/api/v1/business').expect(200);
    expect(res.body.id).toBe(a.businessId);
    await as(t, a).patch('/api/v1/business', { name: 'A renamed' }).expect(200);
    const bRow = await t.prisma.business.findUniqueOrThrow({ where: { id: b.businessId } });
    expect(bRow.name).not.toBe('A renamed');
  });
});

describe('staff role limits', () => {
  it('staff cannot read or change business settings', async () => {
    await as(t, aStaff).get('/api/v1/business').expect(403);
    await as(t, aStaff).patch('/api/v1/business', { name: 'x' }).expect(403);
  });

  it('staff cannot create, edit, delete or invite staff', async () => {
    await as(t, aStaff).post('/api/v1/staff', { displayName: 'x' }).expect(403);
    await as(t, aStaff).patch(`/api/v1/staff/${a.staffId}`, { active: false }).expect(403);
    await as(t, aStaff).delete(`/api/v1/staff/${a.staffId}`).expect(403);
    await as(t, aStaff).post(`/api/v1/staff/${a.staffId}/invite`, { email: 'x@example.test' }).expect(403);
  });

  it('staff can list colleagues but never see their login emails', async () => {
    const res = await as(t, aStaff).get('/api/v1/staff').expect(200);
    expect(res.body.items.every((s: { email: string | null }) => s.email === null)).toBe(true);
  });

  it('a made-up API key is rejected', async () => {
    await t.http.get('/api/v1/staff').set('Authorization', 'Bearer sw_live_abc_def').expect(401);
  });
});
