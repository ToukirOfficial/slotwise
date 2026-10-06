import { Inject, Injectable } from '@nestjs/common';
import {
  type CreatedWebhook,
  ErrorCode,
  type PageQuery,
  type WebhookDelivery,
  type WebhookEndpoint,
  type WebhookEvent,
} from '@slotwise/shared';
import { APP_CONFIG, type AppConfig } from '../config.js';
import type { AuthContext } from '../common/auth.js';
import { encrypt, randomToken } from '../common/crypto.js';
import { AppError, notFound } from '../common/errors.js';
import { idPage, toPage } from '../common/pagination.js';
import { demoRestricted } from '../developer/api-keys.service.js';
import type { WebhookDelivery as DeliveryRow, WebhookEndpoint as EndpointRow } from '../generated/prisma/client.js';
import { jobId } from '../jobs/job-ids.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { WebhookDeliveryService } from './delivery.service.js';
import { UrlRejected, vetUrl } from './ssrf.js';

const toEndpoint = (e: EndpointRow): WebhookEndpoint => ({
  id: e.id,
  url: e.url,
  events: e.events as WebhookEvent[],
  active: e.active,
  createdAt: e.createdAt.toISOString(),
});

const toDelivery = (d: DeliveryRow): WebhookDelivery => ({
  id: d.id,
  event: d.event,
  attempt: d.attempt,
  statusCode: d.statusCode,
  durationMs: d.durationMs,
  error: d.error,
  responseExcerpt: d.responseExcerpt,
  nextRetryAt: d.nextRetryAt?.toISOString() ?? null,
  createdAt: d.createdAt.toISOString(),
});

@Injectable()
export class WebhooksService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WebhookDeliveryService) private readonly deliveries: WebhookDeliveryService,
  ) {}

  /** Quick feedback when saving; the full check runs again before every delivery (DNS can change). */
  private async checkUrl(url: string) {
    try {
      await vetUrl(url, { production: this.config.NODE_ENV === 'production', allowPrivate: this.config.WEBHOOK_ALLOW_PRIVATE });
    } catch (err) {
      const reason = err instanceof UrlRejected ? err.message : 'URL rejected';
      throw new AppError(422, ErrorCode.WEBHOOK_URL_REJECTED, `This URL can’t be used: ${reason}.`, { url: reason });
    }
  }

  async list(auth: AuthContext, q: PageQuery) {
    const page = idPage(q);
    const rows = await this.prisma.webhookEndpoint.findMany({ ...page, where: { ...page.where, businessId: auth.businessId } });
    return toPage(rows, q.limit, toEndpoint);
  }

  /** The signing secret is returned once and stored AES-256-GCM encrypted. */
  async create(auth: AuthContext, body: { url: string; events: WebhookEvent[] }): Promise<CreatedWebhook> {
    if (auth.isDemo) throw demoRestricted('webhooks');
    await this.checkUrl(body.url);
    const secret = `whsec_${randomToken()}`;
    const row = await this.prisma.webhookEndpoint.create({
      data: {
        businessId: auth.businessId,
        url: body.url,
        events: [...new Set(body.events)],
        secretEncrypted: encrypt(secret, this.config.ENCRYPTION_KEY),
      },
    });
    return { ...toEndpoint(row), secret };
  }

  async update(auth: AuthContext, id: string, body: { url?: string; events?: WebhookEvent[]; active?: boolean }) {
    await this.find(auth, id);
    if (body.url) await this.checkUrl(body.url);
    const row = await this.prisma.webhookEndpoint.update({
      where: { id },
      data: { ...body, ...(body.events ? { events: [...new Set(body.events)] } : {}) },
    });
    return toEndpoint(row);
  }

  async remove(auth: AuthContext, id: string): Promise<void> {
    await this.find(auth, id);
    await this.prisma.webhookEndpoint.delete({ where: { id } });
  }

  /** Newest first. */
  async listDeliveries(auth: AuthContext, id: string, q: PageQuery) {
    await this.find(auth, id);
    idPage(q); // validates the cursor
    const rows = await this.prisma.webhookDelivery.findMany({
      where: { endpointId: id, ...(q.cursor ? { id: { lt: q.cursor } } : {}) },
      orderBy: { id: 'desc' },
      take: q.limit + 1,
    });
    return toPage(rows, q.limit, toDelivery);
  }

  async sendTest(auth: AuthContext, id: string): Promise<void> {
    const endpoint = await this.find(auth, id);
    await this.deliveries.enqueue(
      { endpointId: endpoint.id, outboxEventId: null, event: 'webhook.test', payload: this.deliveries.testPayload() },
      jobId.webhookTest(endpoint.id, Date.now()),
    );
  }

  /** Sends the same payload again as a new delivery (with its own retries). */
  async resend(auth: AuthContext, deliveryId: string): Promise<void> {
    const d = await this.prisma.webhookDelivery.findFirst({
      where: { id: deliveryId, endpoint: { businessId: auth.businessId } },
    });
    if (!d) throw notFound('Delivery not found.');
    if (!d.payloadJson) throw new AppError(409, ErrorCode.CONFLICT, 'This delivery is older than 30 days and can’t be resent.');
    await this.deliveries.enqueue(
      { endpointId: d.endpointId, outboxEventId: d.outboxEventId, event: d.event, payload: d.payloadJson as never },
      jobId.webhookResend(d.id, Date.now()),
    );
  }

  private async find(auth: AuthContext, id: string): Promise<EndpointRow> {
    const e = await this.prisma.webhookEndpoint.findFirst({ where: { id, businessId: auth.businessId } });
    if (!e) throw notFound('Webhook not found.');
    return e;
  }
}
