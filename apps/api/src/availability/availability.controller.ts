import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { type Availability, type AvailabilityQuery, availabilityQuerySchema, availabilitySchema } from '@slotwise/shared';
import { Allow, Auth, type AuthContext, ownStaffFilter } from '../common/auth.js';
import { notFound } from '../common/errors.js';
import { Returns } from '../common/schema.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AvailabilityService } from './availability.service.js';

@ApiBearerAuth()
@ApiTags('Availability')
@Controller('v1/availability')
export class AvailabilityController {
  constructor(
    @Inject(AvailabilityService) private readonly availability: AvailabilityService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  /** Free start times. `from`/`to` are UK local dates (max 60 days). Staff logins only see their own diary. */
  @Allow('owner', 'staff', 'apiKey')
  @Get()
  @Returns(availabilitySchema)
  async get(@Auth() auth: AuthContext, @Query({ schema: availabilityQuerySchema }) q: AvailabilityQuery): Promise<Availability> {
    const business = await this.prisma.business.findUnique({ where: { id: auth.businessId } });
    if (!business) throw notFound();
    const own = ownStaffFilter(auth);
    if (own && q.staffId !== 'any' && q.staffId !== own) throw notFound('Staff member not found.');
    return this.availability.availability(business, { ...q, staffId: own ?? q.staffId });
  }
}
