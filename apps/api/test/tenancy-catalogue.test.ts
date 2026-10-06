import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addStaffLogin, as, registerOwner, resetDb, type Session, startApp, type TestApp } from './helpers.js';

let t: TestApp;
let a: Session;
let b: Session;
let aStaff: Session;
let bServiceId: string;
let bOverrideId: string;

beforeAll(async () => {
  t = await startApp();
  await resetDb(t.prisma);
  a = await registerOwner(t, 'Business A');
  b = await registerOwner(t, 'Business B');
  aStaff = await addStaffLogin(t, a);
  const svc = await as(t, b).post('/api/v1/services', { name: 'B massage', durationMin: 60 }).expect(201);
  bServiceId = svc.body.id;
  const ovr = await as(t, b).post(`/api/v1/staff/${b.staffId}/overrides`, { date: '2030-01-02', closed: true }).expect(201);
  bOverrideId = ovr.body.id;
});
afterAll(() => t.close());

describe('services: business isolation', () => {
  it("A cannot read, change or delete B's service: 404", async () => {
    for (const res of [
      await as(t, a).get(`/api/v1/services/${bServiceId}`),
      await as(t, a).patch(`/api/v1/services/${bServiceId}`, { name: 'x' }),
      await as(t, a).delete(`/api/v1/services/${bServiceId}`),
    ]) {
      expect(res.status).toBe(404);
    }
    const row = await t.prisma.service.findUniqueOrThrow({ where: { id: bServiceId } });
    expect(row.name).toBe('B massage');
  });

  it("A's service list never contains B's services", async () => {
    await as(t, a).post('/api/v1/services', { name: 'A physio', durationMin: 45 }).expect(201);
    const res = await as(t, a).get('/api/v1/services').expect(200);
    expect(res.body.items.map((s: { name: string }) => s.name)).toEqual(['A physio']);
  });

  it("A cannot link B's service to A's staff", async () => {
    await as(t, a).put(`/api/v1/staff/${a.staffId}/services`, { serviceIds: [bServiceId] }).expect(404);
    expect(await t.prisma.staffService.count({ where: { serviceId: bServiceId } })).toBe(0);
  });
});

describe('hours and overrides: business isolation', () => {
  it("A cannot read or replace B's weekly hours", async () => {
    await as(t, a).get(`/api/v1/staff/${b.staffId}/weekly-hours`).expect(404);
    await as(t, a)
      .put(`/api/v1/staff/${b.staffId}/weekly-hours`, { hours: [{ weekday: 1, startMin: 0, endMin: 60 }] })
      .expect(404);
    expect(await t.prisma.weeklyHours.count({ where: { staffId: b.staffId } })).toBe(0);
  });

  it("A cannot list, add or delete B's overrides", async () => {
    await as(t, a).get(`/api/v1/staff/${b.staffId}/overrides`).expect(404);
    await as(t, a).post(`/api/v1/staff/${b.staffId}/overrides`, { date: '2030-01-03', closed: true }).expect(404);
    await as(t, a).delete(`/api/v1/staff/${b.staffId}/overrides/${bOverrideId}`).expect(404);
    // B's override id under A's own staff id: still not found.
    await as(t, a).delete(`/api/v1/staff/${a.staffId}/overrides/${bOverrideId}`).expect(404);
    expect(await t.prisma.dateOverride.count({ where: { id: bOverrideId } })).toBe(1);
  });
});

describe('staff role: own diary only', () => {
  it('staff can set their own hours and time off', async () => {
    await as(t, aStaff)
      .put(`/api/v1/staff/${aStaff.staffId}/weekly-hours`, { hours: [{ weekday: 2, startMin: 540, endMin: 1020 }] })
      .expect(200);
    await as(t, aStaff).post(`/api/v1/staff/${aStaff.staffId}/overrides`, { date: '2030-02-01', closed: true }).expect(201);
  });

  it("staff cannot touch a colleague's hours or time off", async () => {
    await as(t, aStaff).get(`/api/v1/staff/${a.staffId}/weekly-hours`).expect(404);
    await as(t, aStaff)
      .put(`/api/v1/staff/${a.staffId}/weekly-hours`, { hours: [{ weekday: 1, startMin: 0, endMin: 60 }] })
      .expect(404);
    await as(t, aStaff).post(`/api/v1/staff/${a.staffId}/overrides`, { date: '2030-02-02', closed: true }).expect(404);
  });

  it('staff cannot create, edit or delete services, or change who delivers them', async () => {
    const svc = await as(t, a).post('/api/v1/services', { name: 'A sports massage', durationMin: 30 }).expect(201);
    await as(t, aStaff).post('/api/v1/services', { name: 'x', durationMin: 30 }).expect(403);
    await as(t, aStaff).patch(`/api/v1/services/${svc.body.id}`, { name: 'x' }).expect(403);
    await as(t, aStaff).delete(`/api/v1/services/${svc.body.id}`).expect(403);
    await as(t, aStaff).put(`/api/v1/staff/${aStaff.staffId}/services`, { serviceIds: [svc.body.id] }).expect(403);
    await as(t, aStaff).get('/api/v1/services').expect(200);
  });
});

describe('hours validation', () => {
  it('rejects overlapping windows on the same weekday', async () => {
    const res = await as(t, a)
      .put(`/api/v1/staff/${a.staffId}/weekly-hours`, {
        hours: [
          { weekday: 1, startMin: 540, endMin: 720 },
          { weekday: 1, startMin: 700, endMin: 1020 },
        ],
      })
      .expect(400);
    expect(res.body.errorCode).toBe('VALIDATION_FAILED');
  });

  it('a closed day and special hours on the same date conflict', async () => {
    await as(t, a).post(`/api/v1/staff/${a.staffId}/overrides`, { date: '2030-03-01', closed: true }).expect(201);
    await as(t, a)
      .post(`/api/v1/staff/${a.staffId}/overrides`, { date: '2030-03-01', closed: false, startMin: 600, endMin: 700 })
      .expect(409);
  });
});
