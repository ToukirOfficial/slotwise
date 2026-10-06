import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createServiceBodySchema,
  type CreateServiceBody,
  idParamsSchema,
  okSchema,
  pageOf,
  type Service,
  serviceListQuerySchema,
  serviceSchema,
  updateServiceBodySchema,
  type UpdateServiceBody,
} from '@slotwise/shared';
import { Allow, Auth, type AuthContext } from '../common/auth.js';
import { Returns } from '../common/schema.js';
import { ServicesService } from './services.service.js';

@ApiTags('Services')
@Controller('v1/services')
export class ServicesController {
  constructor(@Inject(ServicesService) private readonly services: ServicesService) {}

  @Allow('owner', 'staff', 'apiKey')
  @Get()
  @Returns(pageOf(serviceSchema))
  list(
    @Auth() auth: AuthContext,
    @Query({ schema: serviceListQuerySchema }) q: { cursor?: string; limit: number; active?: 'true' | 'false' },
  ) {
    return this.services.list(auth, q);
  }

  @Allow('owner')
  @Post()
  @Returns(serviceSchema, 201)
  create(@Auth() auth: AuthContext, @Body({ schema: createServiceBodySchema }) body: CreateServiceBody): Promise<Service> {
    return this.services.create(auth, body);
  }

  @Allow('owner', 'staff', 'apiKey')
  @Get(':id')
  @Returns(serviceSchema)
  get(@Auth() auth: AuthContext, @Param({ schema: idParamsSchema }) p: { id: string }): Promise<Service> {
    return this.services.get(auth, p.id);
  }

  @Allow('owner')
  @Patch(':id')
  @Returns(serviceSchema)
  update(
    @Auth() auth: AuthContext,
    @Param({ schema: idParamsSchema }) p: { id: string },
    @Body({ schema: updateServiceBodySchema }) body: UpdateServiceBody,
  ): Promise<Service> {
    return this.services.update(auth, p.id, body);
  }

  @Allow('owner')
  @Delete(':id')
  @Returns(okSchema)
  async remove(@Auth() auth: AuthContext, @Param({ schema: idParamsSchema }) p: { id: string }) {
    await this.services.remove(auth, p.id);
    return { ok: true as const };
  }
}
