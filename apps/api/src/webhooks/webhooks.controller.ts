import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  type CreatedWebhook,
  createdWebhookSchema,
  createWebhookBodySchema,
  idParamsSchema,
  okSchema,
  type PageQuery,
  pageOf,
  pageQuerySchema,
  updateWebhookBodySchema,
  webhookDeliverySchema,
  webhookEndpointSchema,
  type WebhookEvent,
} from '@slotwise/shared';
import { Allow, Auth, type AuthContext } from '../common/auth.js';
import { Returns } from '../common/schema.js';
import { WebhooksService } from './webhooks.service.js';

/**
 * Webhook endpoints. Each POST carries `Slotwise-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>`;
 * reject timestamps older than 5 minutes. Owner only (API keys can't manage webhooks).
 */
@ApiTags('Webhooks (dashboard)')
@Controller('v1/webhooks')
export class WebhooksController {
  constructor(@Inject(WebhooksService) private readonly webhooks: WebhooksService) {}

  @Allow('owner')
  @Get()
  @Returns(pageOf(webhookEndpointSchema))
  list(@Auth() auth: AuthContext, @Query({ schema: pageQuerySchema }) q: PageQuery) {
    return this.webhooks.list(auth, q);
  }

  @Allow('owner')
  @Post()
  @Returns(createdWebhookSchema, 201)
  create(
    @Auth() auth: AuthContext,
    @Body({ schema: createWebhookBodySchema }) body: { url: string; events: WebhookEvent[] },
  ): Promise<CreatedWebhook> {
    return this.webhooks.create(auth, body);
  }

  @Allow('owner')
  @Post('deliveries/:id/resend')
  @Returns(okSchema)
  async resend(@Auth() auth: AuthContext, @Param({ schema: idParamsSchema }) p: { id: string }) {
    await this.webhooks.resend(auth, p.id);
    return { ok: true as const };
  }

  @Allow('owner')
  @Patch(':id')
  @Returns(webhookEndpointSchema)
  update(
    @Auth() auth: AuthContext,
    @Param({ schema: idParamsSchema }) p: { id: string },
    @Body({ schema: updateWebhookBodySchema }) body: { url?: string; events?: WebhookEvent[]; active?: boolean },
  ) {
    return this.webhooks.update(auth, p.id, body);
  }

  @Allow('owner')
  @Delete(':id')
  @Returns(okSchema)
  async remove(@Auth() auth: AuthContext, @Param({ schema: idParamsSchema }) p: { id: string }) {
    await this.webhooks.remove(auth, p.id);
    return { ok: true as const };
  }

  @Allow('owner')
  @Post(':id/test')
  @Returns(okSchema)
  async test(@Auth() auth: AuthContext, @Param({ schema: idParamsSchema }) p: { id: string }) {
    await this.webhooks.sendTest(auth, p.id);
    return { ok: true as const };
  }

  @Allow('owner')
  @Get(':id/deliveries')
  @Returns(pageOf(webhookDeliverySchema))
  deliveries(@Auth() auth: AuthContext, @Param({ schema: idParamsSchema }) p: { id: string }, @Query({ schema: pageQuerySchema }) q: PageQuery) {
    return this.webhooks.listDeliveries(auth, p.id, q);
  }
}
