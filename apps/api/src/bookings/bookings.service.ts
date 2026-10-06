import { Inject, Injectable } from '@nestjs/common';
import { isWithinWorkingHours } from '@slotwise/engine';
import {
  type Booking,
  type BookingListQuery,
  type CreateBookingBody,
  ErrorCode,
} from '@slotwise/shared';
import { Temporal } from 'temporal-polyfill';
import { AuditService, type Actor } from '../audit/audit.service.js';
import { type Lengths, AvailabilityService } from '../availability/availability.service.js';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { sha256 } from '../common/crypto.js';
import { AppError, notFound } from '../common/errors.js';
import { uuidv7 } from '../common/ids.js';
import { fromDateColumn, toInstant } from '../common/time.js';
import type { Business, BookingSource, Prisma } from '../generated/prisma/client.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { PrismaService, type Tx } from '../prisma/prisma.service.js';
import { IdempotencyService, type IdempotentResult } from './idempotency.service.js';
import { manageToken } from './manage-token.js';
import { isSlotConflict } from './slot-conflict.js';

const include = {
  staff: { select: { id: true, displayName: true } },
  customer: { select: { id: true, name: true, email: true, phone: true } },
} satisfies Prisma.BookingInclude;
export type BookingRow = Prisma.BookingGetPayload<{ include: typeof include }>;

const MAX_FUTURE_PER_CUSTOMER = 3;

const slotTaken = () =>
  new AppError(409, ErrorCode.SLOT_TAKEN, 'Sorry, that time was just taken — please pick another.');
const slotUnavailable = () =>
  new AppError(422, ErrorCode.SLOT_UNAVAILABLE, 'That time can’t be booked. Please pick one of the times offered.');
const notChangeable = (msg: string) => new AppError(409, ErrorCode.BOOKING_NOT_CHANGEABLE, msg);

/** Audit before/after: ids, status and times only (no personal data). */
const auditShape = (b: { status: string; startsAt: Date; endsAt: Date; staffId: string; version: number }) => ({
  status: b.status,
  startsAt: b.startsAt.toISOString(),
  endsAt: b.endsAt.toISOString(),
  staffId: b.staffId,
  version: b.version,
});

export interface Caller {
  actor: Actor;
  /** Staff-role logins are limited to their own diary. */
  staffFilter: string | null;
  /** Customers (widget/manage link) are bound by the cut-off; owners and staff aren't. */
  enforceCutoff: boolean;
}

@Injectable()
export class BookingsService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AvailabilityService) private readonly availability: AvailabilityService,
    @Inject(IdempotencyService) private readonly idempotency: IdempotencyService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  // ─── Create ──────────────────────────────────────────────────────────────────────────────────────────

  /**
   * Books a slot. The client's list of times is never trusted: the start is re-validated against current
   * hours, notice and horizon. The database has the final word on overlaps (exclusion constraint); for
   * "any staff" each candidate is tried in its own savepoint, so one conflict doesn't abort the transaction.
   */
  async create(args: {
    business: Business;
    body: CreateBookingBody;
    source: BookingSource;
    caller: Caller;
    idempotencyKey: string | undefined;
    /** Abuse limit for customer-facing channels: max future bookings per email. */
    limitPerCustomer: boolean;
  }): Promise<IdempotentResult<Booking>> {
    const { business, body, caller } = args;
    let eventId: string | undefined;

    const result = await this.idempotency.run(
      business.id,
      args.idempotencyKey,
      { op: 'create', source: args.source, body },
      async () => {
        const service = await this.availability.bookableService(business.id, body.serviceId);
        if (caller.staffFilter && body.staffId !== 'any' && body.staffId !== caller.staffFilter) {
          throw notFound('Staff member not found.');
        }
        const requested = caller.staffFilter ?? body.staffId;
        const start = Temporal.Instant.from(body.startsAt);
        const candidates = await this.candidatesFor(business, service, requested, start);
        return { service, start, candidates };
      },
      async (tx, { service, start, candidates }) => {
        const email = body.customer.email;
        if (args.limitPerCustomer) {
          const future = await tx.booking.count({
            where: {
              businessId: business.id,
              status: 'confirmed',
              startsAt: { gt: new Date() },
              customer: { emailNormalized: email },
            },
          });
          if (future >= MAX_FUTURE_PER_CUSTOMER) {
            throw new AppError(
              409,
              ErrorCode.BOOKING_LIMIT,
              `You already have ${MAX_FUTURE_PER_CUSTOMER} upcoming bookings here. Please contact the business.`,
            );
          }
        }

        // Matched by email within the business; name and phone are refreshed on every booking.
        const customer = await tx.customer.upsert({
          where: { businessId_emailNormalized: { businessId: business.id, emailNormalized: email } },
          create: { businessId: business.id, name: body.customer.name, email, emailNormalized: email, phone: body.customer.phone },
          update: { name: body.customer.name, phone: body.customer.phone, email },
        });

        const id = uuidv7();
        const startsAt = new Date(start.epochMilliseconds);
        const endsAt = new Date(start.epochMilliseconds + service.durationMin * 60_000);
        const data = {
          id,
          businessId: business.id,
          serviceId: service.id,
          customerId: customer.id,
          startsAt,
          endsAt,
          blockedStart: new Date(startsAt.getTime() - service.bufferBeforeMin * 60_000),
          blockedEnd: new Date(endsAt.getTime() + service.bufferAfterMin * 60_000),
          serviceName: service.name,
          durationMin: service.durationMin,
          bufferBeforeMin: service.bufferBeforeMin,
          bufferAfterMin: service.bufferAfterMin,
          pricePence: service.pricePence,
          source: args.source,
          manageTokenHash: sha256(manageToken(this.config.MANAGE_TOKEN_SECRET, id)),
          manageTokenExpiresAt: endsAt,
        };

        let booking: BookingRow | undefined;
        for (const staffId of candidates) {
          await tx.$executeRawUnsafe('SAVEPOINT booking_attempt');
          try {
            booking = await tx.booking.create({ data: { ...data, staffId }, include });
            await tx.$executeRawUnsafe('RELEASE SAVEPOINT booking_attempt');
            break;
          } catch (err) {
            await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT booking_attempt');
            if (!isSlotConflict(err)) throw err;
          }
        }
        if (!booking) throw slotTaken();

        eventId = await this.outbox.add(tx, business.id, { type: 'booking.created', bookingId: booking.id, version: 1 });
        await this.audit.record(tx, {
          businessId: business.id,
          actor: caller.actor.actorType === 'customer' ? { actorType: 'customer', actorId: customer.id } : caller.actor,
          action: 'booking.created',
          entity: 'booking',
          entityId: booking.id,
          after: auditShape(booking),
        });
        return { status: 201, body: { bookingId: booking.id } };
      },
    );
    if (eventId) this.outbox.dispatchSoon([eventId]);
    return this.resolve(result, business.id);
  }

  /**
   * Staff ids that are offered this start, in the order to try them. For "any": fewest confirmed bookings
   * that local day first, then id (stable). Distinguishes "just taken" (409) from "never valid" (422).
   */
  private async candidatesFor(
    business: Business,
    service: Lengths & { id: string },
    staffId: string,
    start: Temporal.Instant,
  ): Promise<string[]> {
    const staffIds = await this.availability.eligibleStaffIds(business.id, service.id, staffId);
    const date = start.toZonedDateTimeISO(business.timezone).toPlainDate().toString();
    const iso = new Date(start.epochMilliseconds).toISOString();
    const offers = (per: { staffId: string; days: { slots: { startsAt: string }[] }[] }[]) =>
      per.filter((p) => p.days.some((d) => d.slots.some((s) => s.startsAt === iso))).map((p) => p.staffId);

    const free = offers(await this.availability.slotsByStaff(business, service, staffIds, date, date));
    if (free.length === 0) {
      const validIgnoringBookings = offers(
        await this.availability.slotsByStaff(business, service, staffIds, date, date, { ignoreBusy: true }),
      );
      throw validIgnoringBookings.length > 0 ? slotTaken() : slotUnavailable();
    }
    if (free.length === 1) return free;

    const dayStart = Temporal.PlainDate.from(date).toZonedDateTime(business.timezone).toInstant();
    const dayEnd = Temporal.PlainDate.from(date).add({ days: 1 }).toZonedDateTime(business.timezone).toInstant();
    const counts = await this.prisma.booking.groupBy({
      by: ['staffId'],
      where: {
        staffId: { in: free },
        status: 'confirmed',
        startsAt: { gte: new Date(dayStart.epochMilliseconds), lt: new Date(dayEnd.epochMilliseconds) },
      },
      _count: { _all: true },
    });
    const count = (id: string) => counts.find((c) => c.staffId === id)?._count._all ?? 0;
    return [...free].sort((a, b) => count(a) - count(b) || a.localeCompare(b));
  }

  // ─── Cancel ──────────────────────────────────────────────────────────────────────────────────────────

  /** Cancelling twice is harmless: the second call returns the booking unchanged. */
  async cancel(businessId: string, bookingId: string, caller: Caller, reason?: string): Promise<Booking> {
    let eventId: string | undefined;
    const row = await this.prisma.$transaction(async (tx) => {
      const before = await this.lockForChange(tx, businessId, bookingId, caller.staffFilter);
      if (before.status === 'cancelled') return before;
      await this.assertChangeable(tx, before, caller);

      const after = await tx.booking.update({
        where: { id: before.id },
        data: {
          status: 'cancelled',
          cancelledAt: new Date(),
          cancelReason: reason ?? null,
          version: { increment: 1 },
        },
        include,
      });
      eventId = await this.outbox.add(tx, businessId, { type: 'booking.cancelled', bookingId, version: after.version });
      await this.audit.record(tx, {
        businessId,
        actor: caller.actor,
        action: 'booking.cancelled',
        entity: 'booking',
        entityId: bookingId,
        before: auditShape(before),
        after: auditShape(after),
      });
      return after;
    });
    if (eventId) this.outbox.dispatchSoon([eventId]);
    return this.withHoursFlag(row);
  }

  // ─── Reschedule ──────────────────────────────────────────────────────────────────────────────────────

  /**
   * Moves a booking with ONE update of its times. The exclusion constraint checks the new range against
   * every other booking: either the new slot is taken and the old one freed together, or nothing changes.
   */
  async reschedule(args: {
    business: Business;
    bookingId: string;
    startsAt: string;
    caller: Caller;
    idempotencyKey: string | undefined;
  }): Promise<IdempotentResult<Booking>> {
    const { business, bookingId, caller } = args;
    let eventId: string | undefined;
    const result = await this.idempotency.run(
      business.id,
      args.idempotencyKey,
      { op: 'reschedule', bookingId, startsAt: args.startsAt },
      async () => {
        const current = await this.prisma.booking.findFirst({
          where: { id: bookingId, businessId: business.id, ...(caller.staffFilter ? { staffId: caller.staffFilter } : {}) },
          include,
        });
        if (!current) throw notFound('Booking not found.');
        if (current.status !== 'confirmed') throw notChangeable('This booking was cancelled.');
        const start = Temporal.Instant.from(args.startsAt);
        if (start.epochMilliseconds === current.startsAt.getTime()) return { start, unchanged: true };
        // Validate with the booking's own snapshot (the service may have changed since), ignoring its old slot.
        const lengths = { durationMin: current.durationMin, bufferBeforeMin: current.bufferBeforeMin, bufferAfterMin: current.bufferAfterMin };
        const date = start.toZonedDateTimeISO(business.timezone).toPlainDate().toString();
        const iso = new Date(start.epochMilliseconds).toISOString();
        const [slots] = await this.availability.slotsByStaff(business, lengths, [current.staffId], date, date, {
          excludeBookingId: current.id,
        });
        if (!slots?.days.some((d) => d.slots.some((s) => s.startsAt === iso))) {
          const [ignoring] = await this.availability.slotsByStaff(business, lengths, [current.staffId], date, date, {
            ignoreBusy: true,
          });
          throw ignoring?.days.some((d) => d.slots.some((s) => s.startsAt === iso)) ? slotTaken() : slotUnavailable();
        }
        return { start, unchanged: false };
      },
      async (tx, { start, unchanged }) => {
        const before = await this.lockForChange(tx, business.id, bookingId, caller.staffFilter);
        if (before.status !== 'confirmed') throw notChangeable('This booking was cancelled.');
        await this.assertChangeable(tx, before, caller);
        if (unchanged) return { status: 200, body: { bookingId } };

        const startsAt = new Date(start.epochMilliseconds);
        const endsAt = new Date(start.epochMilliseconds + before.durationMin * 60_000);
        let after: BookingRow;
        try {
          after = await tx.booking.update({
            where: { id: before.id },
            data: {
              startsAt,
              endsAt,
              blockedStart: new Date(startsAt.getTime() - before.bufferBeforeMin * 60_000),
              blockedEnd: new Date(endsAt.getTime() + before.bufferAfterMin * 60_000),
              version: { increment: 1 },
              manageTokenExpiresAt: endsAt,
            },
            include,
          });
        } catch (err) {
          if (isSlotConflict(err)) throw slotTaken();
          throw err;
        }
        eventId = await this.outbox.add(tx, business.id, {
          type: 'booking.rescheduled',
          bookingId,
          version: after.version,
        });
        await this.audit.record(tx, {
          businessId: business.id,
          actor: caller.actor,
          action: 'booking.rescheduled',
          entity: 'booking',
          entityId: bookingId,
          before: auditShape(before),
          after: auditShape(after),
        });
        return { status: 200, body: { bookingId: after.id } };
      },
    );
    if (eventId) this.outbox.dispatchSoon([eventId]);
    return this.resolve(result, business.id);
  }

  /**
   * Idempotency rows store only the booking id (never customer details, which live only in `customers`);
   * the response is rebuilt from the database, for first answers and replays alike.
   */
  private async resolve(
    result: IdempotentResult<{ bookingId: string }>,
    businessId: string,
  ): Promise<IdempotentResult<Booking>> {
    return { ...result, body: await this.get(businessId, result.body.bookingId, null) };
  }

  // ─── Read ────────────────────────────────────────────────────────────────────────────────────────────

  async get(businessId: string, bookingId: string, staffFilter: string | null): Promise<Booking> {
    const row = await this.prisma.booking.findFirst({
      where: { id: bookingId, businessId, ...(staffFilter ? { staffId: staffFilter } : {}) },
      include,
    });
    if (!row) throw notFound('Booking not found.');
    return this.withHoursFlag(row);
  }

  /** Keyset pagination on (startsAt, id): stable even when many bookings share a start time. */
  async list(business: Business, q: BookingListQuery, staffFilter: string | null) {
    if (staffFilter && q.staffId && q.staffId !== staffFilter) return { items: [], nextCursor: null };
    const zone = business.timezone;
    const dayStart = (date: string) => new Date(Temporal.PlainDate.from(date).toZonedDateTime(zone).epochMilliseconds);
    const cursor = q.cursor ? decodeCursor(q.cursor) : null;
    const staffId = staffFilter ?? q.staffId;

    const rows = await this.prisma.booking.findMany({
      where: {
        businessId: business.id,
        ...(staffId ? { staffId } : {}),
        ...(q.status ? { status: q.status } : {}),
        AND: [
          q.from ? { startsAt: { gte: dayStart(q.from) } } : {},
          q.to ? { startsAt: { lt: dayStart(Temporal.PlainDate.from(q.to).add({ days: 1 }).toString()) } } : {},
          cursor
            ? { OR: [{ startsAt: { gt: cursor.startsAt } }, { startsAt: cursor.startsAt, id: { gt: cursor.id } }] }
            : {},
          q.q
            ? {
                customer: {
                  OR: [
                    { name: { contains: q.q, mode: 'insensitive' } },
                    { email: { contains: q.q, mode: 'insensitive' } },
                    { phone: { contains: q.q } },
                  ],
                },
              }
            : {},
        ],
      },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      take: q.limit + 1,
      include,
    });
    const hasMore = rows.length > q.limit;
    const page = hasMore ? rows.slice(0, q.limit) : rows;
    const flags = await this.hoursFlags(business, page);
    const last = page.at(-1);
    return {
      items: page.map((r) => this.toDto(r, flags.get(r.id) ?? false)),
      nextCursor: hasMore && last ? encodeCursor(last.startsAt, last.id) : null,
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────────────────────────────

  /** Row-locks the booking for the rest of the transaction. Tenant- and staff-scoped: others get 404. */
  private async lockForChange(tx: Tx, businessId: string, bookingId: string, staffFilter: string | null) {
    await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${bookingId}::uuid AND business_id = ${businessId}::uuid FOR UPDATE`;
    const row = await tx.booking.findFirst({
      where: { id: bookingId, businessId, ...(staffFilter ? { staffId: staffFilter } : {}) },
      include,
    });
    if (!row) throw notFound('Booking not found.');
    return row;
  }

  /** Past appointments can't change; customers are also bound by the business's cut-off. */
  private async assertChangeable(tx: Tx, b: BookingRow, caller: Caller): Promise<void> {
    const now = Date.now();
    if (b.startsAt.getTime() <= now) throw notChangeable('This appointment has already started.');
    if (caller.enforceCutoff) {
      const biz = await tx.business.findUniqueOrThrow({ where: { id: b.businessId }, select: { cancelCutoffHours: true } });
      if (b.startsAt.getTime() - biz.cancelCutoffHours * 3_600_000 <= now) {
        throw new AppError(
          409,
          ErrorCode.CUTOFF_PASSED,
          `Changes aren’t possible within ${biz.cancelCutoffHours} hours of the appointment. Please contact the business.`,
        );
      }
    }
  }

  async withHoursFlag(row: BookingRow): Promise<Booking> {
    const business = await this.prisma.business.findUniqueOrThrow({ where: { id: row.businessId } });
    const flags = await this.hoursFlags(business, [row]);
    return this.toDto(row, flags.get(row.id) ?? false);
  }

  /** Which confirmed bookings now fall outside their staff member's working hours (PRD F3). */
  private async hoursFlags(business: Business, rows: BookingRow[]): Promise<Map<string, boolean>> {
    const confirmed = rows.filter((r) => r.status === 'confirmed');
    if (confirmed.length === 0) return new Map();
    const staffIds = [...new Set(confirmed.map((r) => r.staffId))];
    const dates = confirmed.map((r) => r.startsAt.getTime());
    const [hours, overrides] = await Promise.all([
      this.prisma.weeklyHours.findMany({ where: { staffId: { in: staffIds } } }),
      this.prisma.dateOverride.findMany({
        where: {
          staffId: { in: staffIds },
          date: { gte: new Date(Math.min(...dates) - 86_400_000), lte: new Date(Math.max(...dates) + 86_400_000) },
        },
      }),
    ]);
    return new Map(
      confirmed.map((r) => [
        r.id,
        !isWithinWorkingHours({
          zone: business.timezone,
          weeklyHours: hours.filter((h) => h.staffId === r.staffId),
          overrides: overrides
            .filter((o) => o.staffId === r.staffId)
            .map((o) => ({ date: fromDateColumn(o.date), closed: o.closed, startMin: o.startMin, endMin: o.endMin })),
          start: toInstant(r.startsAt),
          end: toInstant(r.endsAt),
        }),
      ]),
    );
  }

  toDto(r: BookingRow, outsideHours: boolean): Booking {
    return {
      id: r.id,
      status: r.status,
      startsAt: r.startsAt.toISOString(),
      endsAt: r.endsAt.toISOString(),
      version: r.version,
      source: r.source,
      staff: r.staff,
      service: {
        id: r.serviceId,
        name: r.serviceName,
        durationMin: r.durationMin,
        bufferBeforeMin: r.bufferBeforeMin,
        bufferAfterMin: r.bufferAfterMin,
        pricePence: r.pricePence,
      },
      customer: r.customer,
      outsideHours,
      cancelledAt: r.cancelledAt?.toISOString() ?? null,
      cancelReason: r.cancelReason,
      createdAt: r.createdAt.toISOString(),
    };
  }
}

const encodeCursor = (startsAt: Date, id: string) => Buffer.from(`${startsAt.toISOString()}|${id}`).toString('base64url');

const decodeCursor = (cursor: string): { startsAt: Date; id: string } => {
  const [iso, id] = Buffer.from(cursor, 'base64url').toString().split('|');
  const startsAt = new Date(iso ?? '');
  if (!id || !/^[0-9a-f-]{36}$/i.test(id) || Number.isNaN(startsAt.getTime())) {
    throw new AppError(400, ErrorCode.VALIDATION_FAILED, 'Invalid cursor.', { cursor: 'Invalid cursor' });
  }
  return { startsAt, id };
};
