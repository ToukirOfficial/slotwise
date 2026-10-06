import { Body, Controller, Get, Headers, Inject, Param, Post, Query, Req, Res } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import {
  type Availability,
  availabilitySchema,
  IDEMPOTENCY_HEADER,
  manageAvailabilityQuerySchema,
  manageParamsSchema,
  type ManageView,
  manageViewSchema,
  type RescheduleBody,
  rescheduleBodySchema,
} from '@slotwise/shared';
import type { Request, Response } from 'express';
import { Public } from '../common/auth.js';
import { RateLimiter } from '../common/rate-limit.js';
import { Returns } from '../common/schema.js';
import { ManageService } from './manage.service.js';

/** Manage-link endpoints for customers. The 256-bit token in the URL is the only credential. */
@ApiTags('Public (manage link)')
@Public()
@Controller('v1/public/manage/:token')
export class ManageController {
  constructor(
    @Inject(ManageService) private readonly manage: ManageService,
    @Inject(RateLimiter) private readonly limiter: RateLimiter,
  ) {}

  @Get()
  @Returns(manageViewSchema)
  async view(@Param({ schema: manageParamsSchema }) p: { token: string }, @Req() req: Request): Promise<ManageView> {
    await this.limiter.hit(`manage:ip:${req.ip}`, 60, 60);
    return this.manage.view(p.token);
  }

  @Get('availability')
  @Returns(availabilitySchema)
  async availability(
    @Param({ schema: manageParamsSchema }) p: { token: string },
    @Query({ schema: manageAvailabilityQuerySchema }) q: { from: string; to: string },
    @Req() req: Request,
  ): Promise<Availability> {
    await this.limiter.hit(`manage:ip:${req.ip}`, 60, 60);
    return this.manage.slots(p.token, q.from, q.to);
  }

  @Post('cancel')
  @Returns(manageViewSchema)
  async cancel(@Param({ schema: manageParamsSchema }) p: { token: string }, @Req() req: Request): Promise<ManageView> {
    await this.limiter.hit(`manage-write:ip:${req.ip}`, 10, 60);
    return this.manage.cancel(p.token);
  }

  @Post('reschedule')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @Returns(manageViewSchema)
  async reschedule(
    @Param({ schema: manageParamsSchema }) p: { token: string },
    @Body({ schema: rescheduleBodySchema }) body: RescheduleBody,
    @Headers(IDEMPOTENCY_HEADER) key: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ManageView> {
    await this.limiter.hit(`manage-write:ip:${req.ip}`, 10, 60);
    const result = await this.manage.reschedule(p.token, body.startsAt, key);
    if (result.replayed) res.setHeader('Idempotent-Replayed', 'true');
    return result.view;
  }
}
