import { z } from 'zod';
import { instantSchema } from './common.js';

// ─── API keys ───────────────────────────────────────────────────────────────────────────────────────────

export const apiKeySchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    /** Public part, shown so owners can tell keys apart: sw_live_<prefix>_… */
    prefix: z.string(),
    lastUsedAt: instantSchema.nullable(),
    revokedAt: instantSchema.nullable(),
    createdAt: instantSchema,
  })
  .meta({ id: 'ApiKey' });
export type ApiKey = z.output<typeof apiKeySchema>;

/** Returned once, on creation. The full key is never shown again. */
export const createdApiKeySchema = apiKeySchema.extend({ key: z.string() }).meta({ id: 'CreatedApiKey' });
export type CreatedApiKey = z.output<typeof createdApiKeySchema>;

export const createApiKeyBodySchema = z.object({ name: z.string().trim().min(1).max(60) });

// ─── Webhooks ───────────────────────────────────────────────────────────────────────────────────────────

export const WEBHOOK_EVENTS = ['booking.created', 'booking.cancelled', 'booking.rescheduled'] as const;
export const webhookEventSchema = z.enum(WEBHOOK_EVENTS);
export type WebhookEvent = z.infer<typeof webhookEventSchema>;

export const webhookUrlSchema = z
  .url({ protocol: /^https?$/, message: 'Use a full http(s) URL' })
  .max(500)
  .refine((u) => !new URL(u).username && !new URL(u).password, 'Don’t put credentials in the URL');

export const webhookEndpointSchema = z
  .object({
    id: z.uuid(),
    url: z.string(),
    events: z.array(webhookEventSchema),
    active: z.boolean(),
    createdAt: instantSchema,
  })
  .meta({ id: 'WebhookEndpoint' });
export type WebhookEndpoint = z.output<typeof webhookEndpointSchema>;

/** Returned once, on creation: the signing secret (stored encrypted, never shown again). */
export const createdWebhookSchema = webhookEndpointSchema.extend({ secret: z.string() }).meta({ id: 'CreatedWebhook' });
export type CreatedWebhook = z.output<typeof createdWebhookSchema>;

export const createWebhookBodySchema = z.object({
  url: webhookUrlSchema,
  events: z.array(webhookEventSchema).min(1).default([...WEBHOOK_EVENTS]),
});
export const updateWebhookBodySchema = z
  .object({ url: webhookUrlSchema, events: z.array(webhookEventSchema).min(1), active: z.boolean() })
  .partial();

export const webhookDeliverySchema = z
  .object({
    id: z.uuid(),
    event: z.string(),
    attempt: z.number().int(),
    statusCode: z.number().int().nullable(),
    durationMs: z.number().int().nullable(),
    error: z.string().nullable(),
    responseExcerpt: z.string().nullable(),
    nextRetryAt: instantSchema.nullable(),
    createdAt: instantSchema,
  })
  .meta({ id: 'WebhookDelivery' });
export type WebhookDelivery = z.output<typeof webhookDeliverySchema>;

/** What a webhook POST body looks like. Ids and times only: fetch customer details with your API key. */
export const webhookPayloadSchema = z
  .object({
    id: z.string(),
    type: z.union([webhookEventSchema, z.literal('webhook.test')]),
    createdAt: z.string(),
    data: z.object({
      booking: z
        .object({
          id: z.uuid(),
          status: z.string(),
          startsAt: z.string(),
          endsAt: z.string(),
          version: z.number().int(),
          serviceId: z.uuid(),
          serviceName: z.string(),
          staffId: z.uuid(),
          staffName: z.string(),
          customerId: z.uuid(),
        })
        .nullable(),
    }),
  })
  .meta({ id: 'WebhookPayload' });
export type WebhookPayload = z.infer<typeof webhookPayloadSchema>;
