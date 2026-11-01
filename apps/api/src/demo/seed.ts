import { findSlots } from '@slotwise/engine';
import { Temporal } from 'temporal-polyfill';
import { hashPassword } from '../auth/passwords.js';
import { manageToken } from '../bookings/manage-token.js';
import { sha256 } from '../common/crypto.js';
import { uuidv7 } from '../common/ids.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';

/** Public demo login (shown in the README). The business is flagged is_demo: no email, keys or webhooks. */
export const DEMO_SLUG = 'demo-physio';
export const DEMO_EMAIL = 'demo@slotwise.example';
export const DEMO_PASSWORD = 'demo-physio-2026';

const ZONE = 'Europe/London';
const H = (h: number, m = 0) => h * 60 + m;
/** Index into a list with a possibly negative number. */
const pick = <T>(list: T[], i: number): T => list[((i % list.length) + list.length) % list.length]!;

/** Days seeded around today: a week of history (so the current week is never empty) and a fortnight ahead. */
export const DEMO_PAST_DAYS = 7;
export const DEMO_FUTURE_DAYS = 14;
/** Which past bookings (in creation order) are cancelled; the rest of the past ones happened. */
const CANCELLED_PAST = new Set([3, 10]);
/** Which upcoming booking (in creation order) was moved once, so its history shows a reschedule. */
const MOVED_UPCOMING = 2;

// Fictional people only: example.com addresses and Ofcom's drama phone range.
const CUSTOMERS = ['Sam Taylor', 'Jordan Lee', 'Chris Patel', 'Morgan Davies', 'Jamie Wilson', 'Riley Brown', 'Casey Green', 'Robin Hall'].map(
  (name, i) => ({
    name,
    email: `${name.toLowerCase().replace(' ', '.')}@example.com`,
    phone: `07700 9000${String(i + 1).padStart(2, '0')}`,
  }),
);

/** Deletes and recreates "Demo Physio Clinic" with staff, services, hours, last week's bookings and the next fortnight's. */
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

    // Last week (mostly done, a couple cancelled), today and the next fortnight, placed with the real slot
    // engine so they respect hours and never overlap. Past days are planned as if from the day before.
    const busy = new Map<string, { start: Temporal.Instant; end: Temporal.Instant }[]>();
    let n = 0;
    let past = 0;
    let upcoming = 0;
    // The audit trail the dashboard shows on each booking, written as the real flows would have.
    const audit: Prisma.AuditLogCreateManyInput[] = [];
    for (let d = -DEMO_PAST_DAYS; d <= DEMO_FUTURE_DAYS; d++) {
      const date = today.add({ days: d }).toString();
      const planFrom = d < 0 ? today.add({ days: d - 1 }).toZonedDateTime(ZONE).toInstant() : now;
      for (const [staff, svcs] of delivers) {
        for (let k = 0; k < 2; k++) {
          const service = pick(svcs, d + k);
          const [day] = findSlots({
            zone: ZONE,
            fromDate: date,
            toDate: date,
            now: planFrom,
            weeklyHours: hours.get(staff.id) ?? [],
            overrides: staff.id === priya.id ? [{ date: nextFriday.toString(), closed: true, startMin: null, endMin: null }] : [],
            busy: busy.get(staff.id) ?? [],
            service,
            rules: { minNoticeMin: 60, maxDaysAhead: 60, slotStepMin: 15 },
          });
          const slots = day?.slots ?? [];
          if (slots.length === 0 || (d + k) % 3 === 0) continue; // leave gaps so the diary has free time
          const slot = pick(slots, d * 5 + k * 11);
          const startsAt = new Date(slot.startsAt);
          const endsAt = new Date(slot.endsAt);
          const blockedEnd = new Date(endsAt.getTime() + service.bufferAfterMin * 60_000);
          const id = uuidv7();
          const cancelled = d < 0 && CANCELLED_PAST.has(past++);
          const moved = startsAt.getTime() > now.epochMilliseconds && upcoming++ === MOVED_UPCOMING;
          const DAY = 86_400_000;
          const source = n % 3 === 0 ? 'dashboard' : 'widget';
          const customerId = customers[n % customers.length]!.id;
          const createdAt = new Date(Math.min(startsAt.getTime() - (2 + (n % 5)) * DAY, now.epochMilliseconds));
          await tx.booking.create({
            data: {
              id,
              businessId: business.id,
              staffId: staff.id,
              serviceId: service.id,
              customerId,
              startsAt,
              endsAt,
              blockedStart: startsAt,
              blockedEnd,
              serviceName: service.name,
              durationMin: service.durationMin,
              bufferBeforeMin: service.bufferBeforeMin,
              bufferAfterMin: service.bufferAfterMin,
              pricePence: service.pricePence,
              source,
              createdAt, // booked a few days ahead, like real customers
              ...(cancelled
                ? { status: 'cancelled' as const, cancelledAt: new Date(startsAt.getTime() - DAY), cancelReason: 'Customer can’t make it', version: 2 }
                : {}),
              ...(moved ? { version: 2 } : {}),
              manageTokenHash: sha256(manageToken(manageSecret, id)),
              manageTokenExpiresAt: endsAt,
            },
          });
          n++;
          const shape = (status: string, start: Date, end: Date, version: number) => ({
            status,
            startsAt: start.toISOString(),
            endsAt: end.toISOString(),
            staffId: staff.id,
            version,
          });
          const byCustomer = { actorType: 'customer' as const, actorId: customerId };
          const created = source === 'widget' ? byCustomer : { actorType: 'user' as const, actorId: owner.id };
          const entry = { businessId: business.id, entity: 'booking', entityId: id };
          if (moved) {
            // Booked a day earlier, then moved by the customer to the current time.
            const was = [new Date(startsAt.getTime() - DAY), new Date(endsAt.getTime() - DAY)] as const;
            const movedAt = new Date(Math.min(createdAt.getTime() + DAY, now.epochMilliseconds - 3_600_000));
            audit.push(
              { ...entry, ...created, action: 'booking.created', at: createdAt, afterJson: shape('confirmed', ...was, 1) },
              { ...entry, ...byCustomer, action: 'booking.rescheduled', at: movedAt, beforeJson: shape('confirmed', ...was, 1), afterJson: shape('confirmed', startsAt, endsAt, 2) },
            );
          } else {
            audit.push({ ...entry, ...created, action: 'booking.created', at: createdAt, afterJson: shape('confirmed', startsAt, endsAt, 1) });
          }
          if (cancelled) {
            audit.push({
              ...entry,
              ...byCustomer,
              action: 'booking.cancelled',
              at: new Date(startsAt.getTime() - DAY),
              beforeJson: shape('confirmed', startsAt, endsAt, 1),
              afterJson: shape('cancelled', startsAt, endsAt, 2),
            });
            continue; // the slot is free again
          }
          busy.set(staff.id, [
            ...(busy.get(staff.id) ?? []),
            { start: Temporal.Instant.from(slot.startsAt), end: Temporal.Instant.fromEpochMilliseconds(blockedEnd.getTime()) },
          ]);
        }
      }
    }
    await tx.auditLog.createMany({ data: audit });
  }, { timeout: 60_000 });
}
