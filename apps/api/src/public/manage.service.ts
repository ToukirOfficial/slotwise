import { Inject, Injectable } from '@nestjs/common';
import type { Availability, ManageView } from '@slotwise/shared';
import { AvailabilityService, mergeDays } from '../availability/availability.service.js';
import { type Caller, BookingsService } from '../bookings/bookings.service.js';
import { sha256 } from '../common/crypto.js';
import { notFound } from '../common/errors.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** The customer's side of a booking, reached only through the emailed manage link (no account). */
@Injectable()
export class ManageService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BookingsService) private readonly bookings: BookingsService,
    @Inject(AvailabilityService) private readonly availability: AvailabilityService,
  ) {}

  /** Only the token's hash is stored; the link stops working when the appointment ends. */
  private async find(token: string) {
    const b = await this.prisma.booking.findUnique({
      where: { manageTokenHash: sha256(token) },
      include: { business: true, staff: { select: { displayName: true } } },
    });
    if (!b || b.manageTokenExpiresAt <= new Date()) throw notFound('This link has expired or isn’t valid.');
    return b;
  }

  private caller(customerId: string): Caller {
    return { actor: { actorType: 'customer', actorId: customerId }, staffFilter: null, enforceCutoff: true };
  }

  async view(token: string): Promise<ManageView> {
    const b = await this.find(token);
    const now = Date.now();
    const blockedReason =
      b.status === 'cancelled'
        ? 'cancelled'
        : b.startsAt.getTime() <= now
          ? 'started'
          : b.startsAt.getTime() - b.business.cancelCutoffHours * 3_600_000 <= now
            ? 'cutoff'
            : null;
    return {
      booking: {
        id: b.id,
        status: b.status,
        startsAt: b.startsAt.toISOString(),
        endsAt: b.endsAt.toISOString(),
        serviceName: b.serviceName,
        staffName: b.staff.displayName,
        durationMin: b.durationMin,
      },
      business: {
        name: b.business.name,
        brandColor: b.business.brandColor,
        contactEmail: b.business.contactEmail,
        contactPhone: b.business.contactPhone,
        cancelCutoffHours: b.business.cancelCutoffHours,
      },
      blockedReason,
    };
  }

  /** Free times to move to: same staff member, the booking's own length and buffers, its own slot ignored. */
  async slots(token: string, from: string, to: string): Promise<Availability> {
    const b = await this.find(token);
    const per = await this.availability.slotsByStaff(
      b.business,
      { durationMin: b.durationMin, bufferBeforeMin: b.bufferBeforeMin, bufferAfterMin: b.bufferAfterMin },
      [b.staffId],
      from,
      to,
      { excludeBookingId: b.id },
    );
    return { zone: b.business.timezone, serviceId: b.serviceId, staffId: b.staffId, days: mergeDays(from, to, per) };
  }

  async cancel(token: string): Promise<ManageView> {
    const b = await this.find(token);
    await this.bookings.cancel(b.businessId, b.id, this.caller(b.customerId));
    return this.view(token);
  }

  async reschedule(token: string, startsAt: string, idempotencyKey: string | undefined) {
    const b = await this.find(token);
    const result = await this.bookings.reschedule({
      business: b.business,
      bookingId: b.id,
      startsAt,
      caller: this.caller(b.customerId),
      idempotencyKey,
    });
    return { replayed: result.replayed, view: await this.view(token) };
  }
}
