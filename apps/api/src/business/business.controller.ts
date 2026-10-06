import { Body, Controller, Get, Inject, Patch } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { type Business, businessSchema, updateBusinessBodySchema, type UpdateBusinessBody } from '@slotwise/shared';
import { Allow, Auth, type AuthContext } from '../common/auth.js';
import { Returns } from '../common/schema.js';
import { BusinessService } from './business.service.js';

@ApiTags('Business settings (dashboard)')
@Controller('v1/business')
export class BusinessController {
  constructor(@Inject(BusinessService) private readonly business: BusinessService) {}

  @Allow('owner')
  @Get()
  @Returns(businessSchema)
  get(@Auth() auth: AuthContext): Promise<Business> {
    return this.business.get(auth.businessId);
  }

  @Allow('owner')
  @Patch()
  @Returns(businessSchema)
  update(@Auth() auth: AuthContext, @Body({ schema: updateBusinessBodySchema }) body: UpdateBusinessBody): Promise<Business> {
    return this.business.update(auth.businessId, auth.isDemo, body);
  }
}
