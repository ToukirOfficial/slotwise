import { Inject, Injectable } from '@nestjs/common';
import { type BusyInterval, findSlots, type SlotDay } from '@slotwise/engine';
import type { Availability } from '@slotwise/shared';
import { Temporal } from 'temporal-polyfill';
import { notFound } from '../common/errors.js';
import { dateColumn, fromDateColumn } from '../common/time.js';
import type { Business, Service } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface SlotQuery {
  serviceId: string;
  /** A staff id, or 'any' for every active staff member who delivers the service. */
  staffId: string;
  from: string;
  to: string;
}

export interface StaffSlots {
  staffId: string;
  days: SlotDay[];
}

/**
 * Loads everything the pure engine needs (hours, overrides, existing bookings) in a fixed number of queries
 * — one per table, for all candidate staff at once — then lets the engine do the work.
 */
@Injectable()
export class AvailabilityService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** The bookable service, or 404 (inactive or another business's). */
  async bookableService(businessId: string, serviceId: string): Promise<Service> {
    const service = await this.prisma.service.findFirst({ where: { id: serviceId, businessId, active: true } });
    if (!service) throw notFound('Service not found.');
    return service;
  }

  /** Active staff who deliver the service, in a fixed order (by id). 404 if a named staff member isn't one. */
  async eligibleStaffIds(businessId: string, serviceId: string, staffId: string): Promise<string[]> {
    const rows = await this.prisma.staff.findMany({
      where: {
        businessId,
        active: true,
        services: { some: { serviceId } },
        ...(staffId === 'any' ? {} : { id: staffId }),
      },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    if (staffId !== 'any' && rows.length === 0) throw notFound('Staff member not found.');
    return rows.map((r) => r.id);
  }

  /** Free starts per staff member. `excludeBookingId` ignores one booking's own time (for rescheduling it). */
  async slotsByStaff(
    business: Business,
    service: Service,
    staffIds: string[],
    from: string,
    to: string,
    opts: { now?: Temporal.Instant; excludeBookingId?: string } = {},
  ): Promise<StaffSlots[]> {
    if (staffIds.length === 0) return [];
    const now = opts.now ?? Temporal.Now.instant();
    const zone = business.timezone;
    // Busy intervals: a margin of a day either side covers any offset and buffers.
    const rangeStart = Temporal.PlainDate.from(from).subtract({ days: 1 }).toZonedDateTime(zone).toInstant();
    const rangeEnd = Temporal.PlainDate.from(to).add({ days: 2 }).toZonedDateTime(zone).toInstant();

    const [hours, overrides, busy] = await Promise.all([
      this.prisma.weeklyHours.findMany({ where: { staffId: { in: staffIds } } }),
      this.prisma.dateOverride.findMany({
        where: { staffId: { in: staffIds }, date: { gte: dateColumn(from), lte: dateColumn(to) } },
      }),
      this.busyIntervals(staffIds, rangeStart, rangeEnd, opts.excludeBookingId),
    ]);

    return staffIds.map((staffId) => ({
      staffId,
      days: findSlots({
        zone,
        fromDate: from,
        toDate: to,
        now,
        weeklyHours: hours.filter((h) => h.staffId === staffId),
        overrides: overrides
          .filter((o) => o.staffId === staffId)
          .map((o) => ({ date: fromDateColumn(o.date), closed: o.closed, startMin: o.startMin, endMin: o.endMin })),
        busy: busy.get(staffId) ?? [],
        service: {
          durationMin: service.durationMin,
          bufferBeforeMin: service.bufferBeforeMin,
          bufferAfterMin: service.bufferAfterMin,
        },
        rules: { minNoticeMin: business.minNoticeMin, maxDaysAhead: business.maxDaysAhead, slotStepMin: business.slotStepMin },
      }),
    }));
  }

  /** The public/dashboard view: one staff member, or the union of everyone for "any". */
  async availability(business: Business, q: SlotQuery): Promise<Availability> {
    const service = await this.bookableService(business.id, q.serviceId);
    const staffIds = await this.eligibleStaffIds(business.id, service.id, q.staffId);
    const perStaff = await this.slotsByStaff(business, service, staffIds, q.from, q.to);
    return {
      zone: business.timezone,
      serviceId: service.id,
      staffId: q.staffId === 'any' ? null : q.staffId,
      days: mergeDays(q.from, q.to, perStaff),
    };
  }

  /** Confirmed bookings (with their buffers) per staff member. Bookings arrive in the bookings phase. */
  protected async busyIntervals(
    _staffIds: string[],
    _from: Temporal.Instant,
    _to: Temporal.Instant,
    _excludeBookingId?: string,
  ): Promise<Map<string, BusyInterval[]>> {
    return new Map();
  }
}

/** Union of several staff members' slots, one entry per start time, sorted. */
export function mergeDays(from: string, to: string, perStaff: StaffSlots[]): SlotDay[] {
  const days: SlotDay[] = [];
  for (let d = Temporal.PlainDate.from(from); Temporal.PlainDate.compare(d, Temporal.PlainDate.from(to)) <= 0; d = d.add({ days: 1 })) {
    const date = d.toString();
    const byStart = new Map<string, SlotDay['slots'][number]>();
    for (const s of perStaff) for (const slot of s.days.find((x) => x.date === date)?.slots ?? []) byStart.set(slot.startsAt, slot);
    days.push({ date, slots: [...byStart.values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt)) });
  }
  return days;
}

