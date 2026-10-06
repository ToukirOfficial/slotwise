import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createStaffBodySchema,
  idParamsSchema,
  inviteStaffBodySchema,
  okSchema,
  type PageQuery,
  pageOf,
  pageQuerySchema,
  type Staff,
  staffSchema,
  updateStaffBodySchema,
} from '@slotwise/shared';
import { Allow, Auth, type AuthContext } from '../common/auth.js';
import { Returns } from '../common/schema.js';
import { StaffService } from './staff.service.js';

@ApiTags('Staff')
@Controller('v1/staff')
export class StaffController {
  constructor(@Inject(StaffService) private readonly staff: StaffService) {}

  @Allow('owner', 'staff', 'apiKey')
  @Get()
  @Returns(pageOf(staffSchema))
  list(@Auth() auth: AuthContext, @Query({ schema: pageQuerySchema }) q: PageQuery) {
    return this.staff.list(auth, q);
  }

  @Allow('owner')
  @Post()
  @Returns(staffSchema, 201)
  create(@Auth() auth: AuthContext, @Body({ schema: createStaffBodySchema }) body: { displayName: string }): Promise<Staff> {
    return this.staff.create(auth, body.displayName);
  }

  @Allow('owner', 'staff', 'apiKey')
  @Get(':id')
  @Returns(staffSchema)
  get(@Auth() auth: AuthContext, @Param({ schema: idParamsSchema }) p: { id: string }): Promise<Staff> {
    return this.staff.get(auth, p.id);
  }

  @Allow('owner')
  @Patch(':id')
  @Returns(staffSchema)
  update(
    @Auth() auth: AuthContext,
    @Param({ schema: idParamsSchema }) p: { id: string },
    @Body({ schema: updateStaffBodySchema }) body: { displayName?: string; active?: boolean },
  ): Promise<Staff> {
    return this.staff.update(auth, p.id, body);
  }

  @Allow('owner')
  @Delete(':id')
  @Returns(okSchema)
  async remove(@Auth() auth: AuthContext, @Param({ schema: idParamsSchema }) p: { id: string }) {
    await this.staff.remove(auth, p.id);
    return { ok: true as const };
  }

  @Allow('owner')
  @Post(':id/invite')
  @Returns(staffSchema)
  invite(
    @Auth() auth: AuthContext,
    @Param({ schema: idParamsSchema }) p: { id: string },
    @Body({ schema: inviteStaffBodySchema }) body: { email: string },
  ): Promise<Staff> {
    return this.staff.invite(auth, p.id, body.email);
  }
}
