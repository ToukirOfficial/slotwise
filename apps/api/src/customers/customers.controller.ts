import { Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { type Customer, customerListQuerySchema, customerSchema, idParamsSchema, pageOf } from '@slotwise/shared';
import { actorOf, Allow, Auth, type AuthContext } from '../common/auth.js';
import { Returns } from '../common/schema.js';
import { CustomersService } from './customers.service.js';

@ApiTags('Customers (dashboard)')
@Controller('v1/customers')
export class CustomersController {
  constructor(@Inject(CustomersService) private readonly customers: CustomersService) {}

  @Allow('owner')
  @Get()
  @Returns(pageOf(customerSchema))
  list(@Auth() auth: AuthContext, @Query({ schema: customerListQuerySchema }) q: { q?: string; cursor?: string; limit: number }) {
    return this.customers.list(auth.businessId, q);
  }

  @Allow('owner')
  @Post(':id/erase')
  @Returns(customerSchema)
  erase(@Auth() auth: AuthContext, @Param({ schema: idParamsSchema }) p: { id: string }): Promise<Customer> {
    return this.customers.erase(auth.businessId, p.id, actorOf(auth));
  }
}
