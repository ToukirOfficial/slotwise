import { findSlots } from '@slotwise/engine';
import { Temporal } from 'temporal-polyfill';
import { hashPassword } from '../auth/passwords.js';
import { manageToken } from '../bookings/manage-token.js';
import { sha256 } from '../common/crypto.js';
import { uuidv7 } from '../common/ids.js';
import type { PrismaService } from '../prisma/prisma.service.js';

/** Public demo login (shown in the README). The business is flagged is_demo: no email, keys or webhooks. */
export const DEMO_SLUG = 'demo-physio';
export const DEMO_EMAIL = 'demo@slotwise.example';
export const DEMO_PASSWORD = 'demo-physio-2026';

const ZONE = 'Europe/London';
const H = (h: number, m = 0) => h * 60 + m;

// Fictional people only: example.com addresses and Ofcom's drama phone range.
const CUSTOMERS = ['Sam Taylor', 'Jordan Lee', 'Chris Patel', 'Morgan Davies', 'Jamie Wilson', 'Riley Brown', 'Casey Green', 'Robin Hall'].map(
  (name, i) => ({
    name,
    email: `${name.toLowerCase().replace(' ', '.')}@example.com`,
    phone: `07700 9000${String(i + 1).padStart(2, '0')}`,
  }),
);

/** Deletes and recreates "Demo Physio Clinic" with staff, services, hours and a fortnight of bookings. */
export async function seedDemo(prisma: PrismaService, manageSecret: string, now = Temporal.Now.instant()): Promise<void> {
  const existing = await prisma.business.findUnique({ where: { slug: DEMO_SLUG } });
  if (existing) {
    // Bookings first: their staff/service/customer links are ON DELETE RESTRICT.
    await prisma.$transaction([
      prisma.booking.deleteMany({ where: { businessId: existing.id } }),
      prisma.idempotencyKey.deleteMany({ where: { businessId: existing.id } }),
      prisma.business.delete({ where: { id: existing.id } }),
    ]);
  }
  await prisma.user.deleteMany({ where: { email: DEMO_EMAIL } });

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  await prisma.$transaction(async (tx) => {
    const business = await tx.business.create({
      data: {
        name: 'Demo Physio Clinic',
        slug: DEMO_SLUG,
        brandColor: '#0f766e',
        contactEmail: 'hello@demo-physio.example',
        contactPhone: '020 7946 0000',
        minNoticeMin: 60,
        isDemo: true,
        verifiedAt: new Date(),
      },
    });
    const owner = await tx.user.create({
      data: { businessId: business.id, email: DEMO_EMAIL, passwordHash, role: 'owner', emailVerifiedAt: new Date() },
    });
    const [alex, priya, tom] = await Promise.all([
      tx.staff.create({ data: { businessId: business.id, userId: owner.id, displayName: 'Alex Morgan' } }),
      tx.staff.create({ data: { businessId: business.id, displayName: 'Priya Shah' } }),
      tx.staff.create({ data: { businessId: business.id, displayName: 'Tom Evans' } }),
    ]);
    const [assessment, followUp, massage] = await Promise.all([
      tx.service.create({ data: { businessId: business.id, name: 'Initial assessment', durationMin: 45, bufferAfterMin: 15, pricePence: 6500 } }),
      tx.service.create({ data: { businessId: business.id, name: 'Follow-up session', durationMin: 30, bufferAfterMin: 10, pricePence: 4500 } }),
      tx.service.create({ data: { businessId: business.id, name: 'Sports massage', durationMin: 60, pricePence: 5500 } }),
    ]);
    const delivers: [typeof alex, (typeof assessment)[]][] = [
      [alex, [assessment, followUp, massage]],
      [priya, [assessment, followUp]],
      [tom, [followUp, massage]],
    ];
    await tx.staffService.createMany({
      data: delivers.flatMap(([s, svcs]) => svcs.map((v) => ({ staffId: s.id, serviceId: v.id }))),
    });

    const week = (days: number[], windows: [number, number][]) =>
      days.flatMap((weekday) => windows.map(([startMin, endMin]) => ({ weekday, startMin, endMin })));
    const hours = new Map([
      [alex.id, week([1, 2, 3, 4, 5], [[H(9), H(12, 30)], [H(13, 30), H(17)]])],
      [priya.id, [...week([1, 3, 5], [[H(10), H(18)]]), ...week([6], [[H(9), H(13)]])]],
      [tom.id, [...week([2, 4], [[H(12), H(20)]]), ...week([6], [[H(9), H(14)]])]],
    ]);
    await tx.weeklyHours.createMany({ data: [...hours].flatMap(([staffId, list]) => list.map((h) => ({ staffId, ...h }))) });

    const today = now.toZonedDateTimeISO(ZONE).toPlainDate();
    const nextFriday = today.add({ days: ((5 - today.dayOfWeek + 7) % 7) + 7 });
    await tx.dateOverride.create({ data: { staffId: priya.id, date: new Date(`${nextFriday.toString()}T00:00:00Z`), closed: true } });

    const customers = await Promise.all(
      CUSTOMERS.map((c) => tx.customer.create({ data: { businessId: business.id, ...c, emailNormalized: c.email } })),
    );

    // A fortnight of bookings, placed with the real slot engine so they respect hours and never overlap.
    const busy = new Map<string, { start: Temporal.Instant; end: Temporal.Instant }[]>();
    let n = 0;
    for (let d = 1; d <= 14; d++) {
      const date = today.add({ days: d }).toString();
      for (const [staff, svcs] of delivers) {
        for (let k = 0; k < 2; k++) {
          const service = svcs[(d + k) % svcs.length]!;
          const [day] = findSlots({
            zone: ZONE,
            fromDate: date,
            toDate: date,
            now,
            weeklyHours: hours.get(staff.id) ?? [],
            overrides: staff.id === priya.id ? [{ date: nextFriday.toString(), closed: true, startMin: null, endMin: null }] : [],
            busy: busy.get(staff.id) ?? [],
            service,
            rules: { minNoticeMin: 60, maxDaysAhead: 60, slotStepMin: 15 },
          });
          const slots = day?.slots ?? [];
          if (slots.length === 0 || (d + k) % 3 === 0) continue; // leave gaps so the diary has free time
          const slot = slots[(d * 5 + k * 11) % slots.length]!;
          const startsAt = new Date(slot.startsAt);
          const endsAt = new Date(slot.endsAt);
          const blockedEnd = new Date(endsAt.getTime() + service.bufferAfterMin * 60_000);
          const id = uuidv7();
          await tx.booking.create({
            data: {
              id,
              businessId: business.id,
              staffId: staff.id,
              serviceId: service.id,
              customerId: customers[n++ % customers.length]!.id,
              startsAt,
              endsAt,
              blockedStart: startsAt,
              blockedEnd,
              serviceName: service.name,
              durationMin: service.durationMin,
              bufferBeforeMin: service.bufferBeforeMin,
              bufferAfterMin: service.bufferAfterMin,
              pricePence: service.pricePence,
              source: n % 3 === 0 ? 'dashboard' : 'widget',
              manageTokenHash: sha256(manageToken(manageSecret, id)),
              manageTokenExpiresAt: endsAt,
            },
          });
          busy.set(staff.id, [
            ...(busy.get(staff.id) ?? []),
            { start: Temporal.Instant.from(slot.startsAt), end: Temporal.Instant.fromEpochMilliseconds(blockedEnd.getTime()) },
          ]);
        }
      }
    }
  }, { timeout: 60_000 });
}
