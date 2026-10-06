import { Body, Controller, Get, Headers, Inject, Param, Post, Query, Res } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import {
  type Booking,
  type BookingListQuery,
  bookingListQuerySchema,
  bookingSchema,
  type CancelBody,
  cancelBodySchema,
  type CreateBookingBody,
  createBookingBodySchema,
  IDEMPOTENCY_HEADER,
  idParamsSchema,
  pageOf,
  type RescheduleBody,
  rescheduleBodySchema,
} from '@slotwise/shared';
import type { Response } from 'express';
import { actorOf, Allow, Auth, type AuthContext, ownStaffFilter } from '../common/auth.js';
import { notFound } from '../common/errors.js';
import { Returns } from '../common/schema.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { type Caller, BookingsService } from './bookings.service.js';

const idempotencyDoc = ApiHeader({
  name: 'Idempotency-Key',
  required: true,
  description: 'A unique key per booking attempt (8–100 chars). Retrying with the same key returns the first result.',
});

export const callerFor = (auth: AuthContext): Caller => ({
  actor: actorOf(auth),
  staffFilter: ownStaffFilter(auth),
  enforceCutoff: false,
});

@ApiTags('Bookings')
@Controller('v1/bookings')
export class BookingsController {
  constructor(
    @Inject(BookingsService) private readonly bookings: BookingsService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  private async business(auth: AuthContext) {
    const b = await this.prisma.business.findUnique({ where: { id: auth.businessId } });
    if (!b) throw notFound();
    return b;
  }

  /** Bookings by start time. `from`/`to` are UK local dates; `q` searches customer name, email and phone. */
  @Allow('owner', 'staff', 'apiKey')
  @Get()
  @Returns(pageOf(bookingSchema))
  async list(@Auth() auth: AuthContext, @Query({ schema: bookingListQuerySchema }) q: BookingListQuery) {
    return this.bookings.list(await this.business(auth), q, ownStaffFilter(auth));
  }

  @Allow('owner', 'staff', 'apiKey')
  @Get(':id')
  @Returns(bookingSchema)
  get(@Auth() auth: AuthContext, @Param({ schema: idParamsSchema }) p: { id: string }): Promise<Booking> {
    return this.bookings.get(auth.businessId, p.id, ownStaffFilter(auth));
  }

  /** Same rules as the widget (hours, notice, horizon), re-checked on the server. */
  @Allow('owner', 'staff', 'apiKey')
  @Post()
  @idempotencyDoc
  @Returns(bookingSchema, 201)
  async create(
    @Auth() auth: AuthContext,
    @Body({ schema: createBookingBodySchema }) body: CreateBookingBody,
    @Headers(IDEMPOTENCY_HEADER) key: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Booking> {
    const result = await this.bookings.create({
      business: await this.business(auth),
      body,
      source: auth.kind === 'apiKey' ? 'api' : 'dashboard',
      caller: callerFor(auth),
      idempotencyKey: key,
      // Walk-ins and regulars booked by staff aren't limited (ASSUMPTIONS A12); API bookings are.
      limitPerCustomer: auth.kind === 'apiKey',
    });
    if (result.replayed) res.setHeader('Idempotent-Replayed', 'true');
    return result.body;
  }

  @Allow('owner', 'staff', 'apiKey')
  @Post(':id/cancel')
  @Returns(bookingSchema)
  async cancel(
    @Auth() auth: AuthContext,
    @Param({ schema: idParamsSchema }) p: { id: string },
    @Body({ schema: cancelBodySchema }) body: CancelBody,
  ): Promise<Booking> {
    return this.bookings.cancel(auth.businessId, p.id, callerFor(auth), body.reason);
  }

  @Allow('owner', 'staff', 'apiKey')
  @Post(':id/reschedule')
  @idempotencyDoc
  @Returns(bookingSchema)
  async reschedule(
    @Auth() auth: AuthContext,
    @Param({ schema: idParamsSchema }) p: { id: string },
    @Body({ schema: rescheduleBodySchema }) body: RescheduleBody,
    @Headers(IDEMPOTENCY_HEADER) key: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Booking> {
    const result = await this.bookings.reschedule({
      business: await this.business(auth),
      bookingId: p.id,
      startsAt: body.startsAt,
      caller: callerFor(auth),
      idempotencyKey: key,
    });
    if (result.replayed) res.setHeader('Idempotent-Replayed', 'true');
    return result.body;
  }
}
