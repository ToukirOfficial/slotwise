import { Body, Controller, Delete, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  type ApiKey,
  apiKeySchema,
  type CreatedApiKey,
  createApiKeyBodySchema,
  createdApiKeySchema,
  idParamsSchema,
  type PageQuery,
  pageOf,
  pageQuerySchema,
} from '@slotwise/shared';
import { Allow, Auth, type AuthContext } from '../common/auth.js';
import { Returns } from '../common/schema.js';
import { ApiKeysService } from './api-keys.service.js';

@ApiTags('API keys (dashboard)')
@Controller('v1/api-keys')
export class ApiKeysController {
  constructor(@Inject(ApiKeysService) private readonly keys: ApiKeysService) {}

  @Allow('owner')
  @Get()
  @Returns(pageOf(apiKeySchema))
  list(@Auth() auth: AuthContext, @Query({ schema: pageQuerySchema }) q: PageQuery) {
    return this.keys.list(auth, q);
  }

  @Allow('owner')
  @Post()
  @Returns(createdApiKeySchema, 201)
  create(@Auth() auth: AuthContext, @Body({ schema: createApiKeyBodySchema }) body: { name: string }): Promise<CreatedApiKey> {
    return this.keys.create(auth, body.name);
  }

  @Allow('owner')
  @Delete(':id')
  @Returns(apiKeySchema)
  revoke(@Auth() auth: AuthContext, @Param({ schema: idParamsSchema }) p: { id: string }): Promise<ApiKey> {
    return this.keys.revoke(auth, p.id);
  }
}
