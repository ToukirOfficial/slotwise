import { Controller, Get, Inject, Param, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  type Availability,
  type AvailabilityQuery,
  availabilityQuerySchema,
  availabilitySchema,
  type PublicBusiness,
  publicBusinessSchema,
  slugParamsSchema,
} from '@slotwise/shared';
import type { Request } from 'express';
import { AvailabilityService } from '../availability/availability.service.js';
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
}
