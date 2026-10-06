import { Body, Controller, Delete, Get, Inject, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createOverrideBodySchema,
  type CreateOverrideBody,
  type DateOverride,
  dateOverrideSchema,
  okSchema,
  overrideListQuerySchema,
  overrideParamsSchema,
  putWeeklyHoursBodySchema,
  type PutWeeklyHoursBody,
  staffIdParamsSchema,
  type WeeklyHours,
  weeklyHoursSchema,
} from '@slotwise/shared';
import { z } from 'zod';
import { Allow, Auth, type AuthContext } from '../common/auth.js';
import { Returns } from '../common/schema.js';
import { ScheduleService } from './schedule.service.js';

@ApiTags('Hours and time off (dashboard)')
@Controller('v1/staff/:id')
export class ScheduleController {
  constructor(@Inject(ScheduleService) private readonly schedule: ScheduleService) {}

  @Allow('owner', 'staff')
  @Get('weekly-hours')
  @Returns(weeklyHoursSchema)
  getWeekly(@Auth() auth: AuthContext, @Param({ schema: staffIdParamsSchema }) p: { id: string }): Promise<WeeklyHours> {
    return this.schedule.getWeekly(auth, p.id);
  }

  @Allow('owner', 'staff')
  @Put('weekly-hours')
  @Returns(weeklyHoursSchema)
  putWeekly(
    @Auth() auth: AuthContext,
    @Param({ schema: staffIdParamsSchema }) p: { id: string },
    @Body({ schema: putWeeklyHoursBodySchema }) body: PutWeeklyHoursBody,
  ): Promise<WeeklyHours> {
    return this.schedule.putWeekly(auth, p.id, body.hours);
  }

  @Allow('owner', 'staff')
  @Get('overrides')
  @Returns(z.object({ items: z.array(dateOverrideSchema) }))
  listOverrides(
    @Auth() auth: AuthContext,
    @Param({ schema: staffIdParamsSchema }) p: { id: string },
    @Query({ schema: overrideListQuerySchema }) q: { from?: string; to?: string },
  ) {
    return this.schedule.listOverrides(auth, p.id, q);
  }

  @Allow('owner', 'staff')
  @Post('overrides')
  @Returns(dateOverrideSchema, 201)
  createOverride(
    @Auth() auth: AuthContext,
    @Param({ schema: staffIdParamsSchema }) p: { id: string },
    @Body({ schema: createOverrideBodySchema }) body: CreateOverrideBody,
  ): Promise<DateOverride> {
    return this.schedule.createOverride(auth, p.id, body);
  }

  @Allow('owner', 'staff')
  @Delete('overrides/:overrideId')
  @Returns(okSchema)
  async deleteOverride(
    @Auth() auth: AuthContext,
    @Param({ schema: overrideParamsSchema }) p: { id: string; overrideId: string },
  ) {
    await this.schedule.deleteOverride(auth, p.id, p.overrideId);
    return { ok: true as const };
  }
}
