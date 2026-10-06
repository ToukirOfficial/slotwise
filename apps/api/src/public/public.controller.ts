import { Body, Controller, Get, Headers, Inject, Param, Post, Query, Req, Res } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import {
  type Availability,
  type CreateBookingBody,
  createBookingBodySchema,
  IDEMPOTENCY_HEADER,
  type PublicBooking,
  publicBookingSchema,
  type AvailabilityQuery,
  availabilityQuerySchema,
  availabilitySchema,
  type PublicBusiness,
  publicBusinessSchema,
  slugParamsSchema,
} from '@slotwise/shared';
import type { Request, Response } from 'express';
import { AvailabilityService } from '../availability/availability.service.js';
import { BookingsService } from '../bookings/bookings.service.js';
import { Public } from '../common/auth.js';
import { RateLimiter } from '../common/rate-limit.js';
import { Returns } from '../common/schema.js';
import { PublicService } from './public.service.js';

/** Used by the embeddable widget on customers' own websites: no auth, any origin, no cookies. */
@ApiTags('Public (widget)')
@Public()
@Controller('v1/public')
export class PublicController {
  constructor(
    @Inject(PublicService) private readonly publicService: PublicService,
    @Inject(AvailabilityService) private readonly availability: AvailabilityService,
    @Inject(RateLimiter) private readonly limiter: RateLimiter,
    @Inject(BookingsService) private readonly bookings: BookingsService,
  ) {}

  @Get(':slug')
  @Returns(publicBusinessSchema)
  async profile(@Param({ schema: slugParamsSchema }) p: { slug: string }, @Req() req: Request): Promise<PublicBusiness> {
    await this.limiter.hit(`public:ip:${req.ip}`, 120, 60);
    return this.publicService.profile(p.slug);
  }

  @Get(':slug/availability')
  @Returns(availabilitySchema)
  async slots(
    @Param({ schema: slugParamsSchema }) p: { slug: string },
    @Query({ schema: availabilityQuerySchema }) q: AvailabilityQuery,
    @Req() req: Request,
  ): Promise<Availability> {
    await this.limiter.hit(`availability:ip:${req.ip}`, 60, 60);
    const business = await this.publicService.liveBusiness(p.slug);
    return this.availability.availability(business, q);
  }

  /** Book a slot from the widget. Requires an Idempotency-Key; a double-click never books twice. */
  @Post(':slug/bookings')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @Returns(publicBookingSchema, 201)
  async book(
    @Param({ schema: slugParamsSchema }) p: { slug: string },
    @Body({ schema: createBookingBodySchema }) body: CreateBookingBody,
    @Headers(IDEMPOTENCY_HEADER) key: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PublicBooking> {
    await this.limiter.hit(`booking:ip:${req.ip}`, 10, 60);
    const business = await this.publicService.liveBusiness(p.slug);
    const result = await this.bookings.create({
      business,
      body,
      source: 'widget',
      caller: { actor: { actorType: 'customer', actorId: null }, staffFilter: null, enforceCutoff: true },
      idempotencyKey: key,
      limitPerCustomer: true,
    });
    if (result.replayed) res.setHeader('Idempotent-Replayed', 'true');
    const b = result.body;
    return { id: b.id, status: b.status, startsAt: b.startsAt, endsAt: b.endsAt, serviceName: b.service.name, staffName: b.staff.displayName };
  }
}
