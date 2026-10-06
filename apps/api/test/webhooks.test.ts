import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { decrypt, encrypt } from '../src/common/crypto.js';
import { APP_CONFIG, type AppConfig } from '../src/config.js';
import { WEBHOOK_QUEUE, type WebhookJob } from '../src/jobs/queues.js';
import { OutboxService } from '../src/outbox/outbox.service.js';
import { MAX_ATTEMPTS, WebhookDeliveryService } from '../src/webhooks/delivery.service.js';
import { sign, verify } from '../src/webhooks/signing.js';
import { isBlockedAddress, vetUrl } from '../src/webhooks/ssrf.js';
import { WebhookSender } from '../src/webhooks/webhook-sender.js';
import { type BookableBusiness, bookableBusiness, customer, publicBook, ukTime } from './booking-helpers.js';
import { as, resetDb, startApp, type TestApp } from './helpers.js';

let t: TestApp;
let a: BookableBusiness;
let b: BookableBusiness;
let config: AppConfig;
let queue: Queue<WebhookJob>;

/** A local receiver standing in for a developer's server. */
let server: Server;
let receiverUrl: string;
let received: { headers: Record<string, string | string[] | undefined>; body: string }[] = [];
let reply: { status: number; headers?: Record<string, string> } = { status: 200 };

beforeAll(async () => {
  t = await startApp();
  await resetDb(t.prisma);
  config = t.app.get(APP_CONFIG);
  queue = t.app.get(getQueueToken(WEBHOOK_QUEUE));
  a = await bookableBusiness(t, 'Business A');
  b = await bookableBusiness(t, 'Business B');
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c: Buffer) => (body += c.toString()));
    req.on('end', () => {
      received.push({ headers: req.headers, body });
      res.writeHead(reply.status, reply.headers);
      res.end('x'.repeat(5000)); // longer than the 1 KB we keep
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  receiverUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hooks`;
});
afterAll(async () => {
  server.close();
  await t.close();
});
beforeEach(async () => {
  received = [];
  reply = { status: 200 };
  await queue.obliterate({ force: true });
});

/** The worker's delivery service with private addresses allowed, so it can reach the local receiver. */
const localDelivery = () =>
  new WebhookDeliveryService(config, t.prisma, new WebhookSender({ ...config, WEBHOOK_ALLOW_PRIVATE: true }), queue);

const localEndpoint = async (businessId: string, secret = 'whsec_test_secret_value') =>
  t.prisma.webhookEndpoint.create({
    data: {
      businessId,
      url: receiverUrl,
      events: ['booking.created', 'booking.cancelled', 'booking.rescheduled'],
      secretEncrypted: encrypt(secret, config.ENCRYPTION_KEY),
    },
  });

describe('signing', () => {
  it('a receiver can verify the signature; a changed body, wrong secret or old timestamp fails', () => {
    const body = '{"type":"booking.created"}';
    const header = sign('whsec_abc', body);
    expect(header).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
    expect(verify('whsec_abc', body, header)).toBe(true);
    expect(verify('whsec_abc', body + ' ', header)).toBe(false);
    expect(verify('whsec_other', body, header)).toBe(false);
    const old = sign('whsec_abc', body, Math.floor(Date.now() / 1000) - 600);
    expect(verify('whsec_abc', body, old)).toBe(false);
  });

  it('a real delivery is signed over the exact raw body, carries ids only, and is logged', async () => {
    const endpoint = await localEndpoint(a.businessId, 'whsec_real');
    const booking = await publicBook(t, a.slug, { serviceId: a.serviceId, staffId: 'any', startsAt: ukTime(10, '09:00'), customer: customer() }).expect(201);
    const service = localDelivery();
    const payload = await service.bookingPayload(t.prisma, 'evt-1', 'booking.created', booking.body.id);
    await service.attempt({ endpointId: endpoint.id, outboxEventId: null, event: 'booking.created', payload }, 1);

    expect(received).toHaveLength(1);
    const { headers, body } = received[0]!;
    expect(verify('whsec_real', body, String(headers['slotwise-signature']))).toBe(true);
    expect(body).not.toMatch(/example\.test|Test Customer|07700/); // no customer personal data
    const log = await t.prisma.webhookDelivery.findFirstOrThrow({ where: { endpointId: endpoint.id } });
    expect(log).toMatchObject({ attempt: 1, statusCode: 200, error: null, nextRetryAt: null });
    expect(log.responseExcerpt).toHaveLength(1024);
  });
});

describe('SSRF protection', () => {
  it.each([
    'http://127.0.0.1/hook',
    'http://localhost/hook',
    'http://10.1.2.3/hook',
    'http://172.16.0.5/hook',
    'http://192.168.1.10/hook',
    'http://169.254.169.254/latest/meta-data',
    'http://[::1]/hook',
    'http://[::ffff:127.0.0.1]/hook',
    'http://100.64.0.1/hook',
    'http://0.0.0.0/hook',
  ])('rejects %s after resolving it', async (url) => {
    await expect(vetUrl(url, { production: false, allowPrivate: false })).rejects.toThrow();
  });

  it('requires HTTPS in production and refuses credentials in the URL', async () => {
    await expect(vetUrl('http://93.184.215.14/hook', { production: true, allowPrivate: false })).rejects.toThrow(/HTTPS/);
    await expect(vetUrl('https://user:pw@93.184.215.14/hook', { production: true, allowPrivate: false })).rejects.toThrow();
    await expect(vetUrl('https://93.184.215.14/hook', { production: true, allowPrivate: false })).resolves.toMatchObject({
      address: '93.184.215.14',
    });
  });

  it('classifies addresses correctly', () => {
    expect(isBlockedAddress('8.8.8.8')).toBe(false);
    expect(isBlockedAddress('2606:4700:4700::1111')).toBe(false);
    expect(isBlockedAddress('::ffff:808:808')).toBe(false); // 8.8.8.8, IPv4-mapped
    for (const ip of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '::1', 'fe80::1', 'fc00::1', '::ffff:10.0.0.1', '::ffff:7f00:1']) {
      expect(isBlockedAddress(ip)).toBe(true);
    }
  });

  it('the API refuses to save a private webhook URL', async () => {
    const res = await as(t, a).post('/api/v1/webhooks', { url: receiverUrl }).expect(422);
    expect(res.body.errorCode).toBe('WEBHOOK_URL_REJECTED');
  });

  it('the real sender (no private allowance) never connects to a private address', async () => {
    const endpoint = await localEndpoint(a.businessId);
    const service = new WebhookDeliveryService(config, t.prisma, new WebhookSender(config), queue);
    await expect(
      service.attempt({ endpointId: endpoint.id, outboxEventId: null, event: 'webhook.test', payload: service.testPayload() }, 1),
    ).rejects.toThrow();
    expect(received).toHaveLength(0);
    const log = await t.prisma.webhookDelivery.findFirstOrThrow({ where: { endpointId: endpoint.id }, orderBy: { id: 'desc' } });
    expect(log.error).toMatch(/URL rejected/);
  });

  it('redirects are not followed', async () => {
    reply = { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' } };
    const endpoint = await localEndpoint(a.businessId);
    const service = localDelivery();
    await expect(
      service.attempt({ endpointId: endpoint.id, outboxEventId: null, event: 'webhook.test', payload: service.testPayload() }, 1),
    ).rejects.toThrow();
    expect(received).toHaveLength(1); // only the original request; the redirect target was never called
    const log = await t.prisma.webhookDelivery.findFirstOrThrow({ where: { endpointId: endpoint.id }, orderBy: { id: 'desc' } });
    expect(log).toMatchObject({ statusCode: 302, error: 'Redirects are not followed' });
  });
});

describe('retries', () => {
  it('a failed attempt is logged with its next retry time and throws so BullMQ retries; the last one has no next retry', async () => {
    reply = { status: 500 };
    const endpoint = await localEndpoint(a.businessId);
    const service = localDelivery();
    const job = { endpointId: endpoint.id, outboxEventId: null, event: 'webhook.test', payload: service.testPayload() };
    await expect(service.attempt(job, 1)).rejects.toThrow();
    await expect(service.attempt(job, MAX_ATTEMPTS)).rejects.toThrow();
    const rows = await t.prisma.webhookDelivery.findMany({ where: { endpointId: endpoint.id }, orderBy: { attempt: 'asc' } });
    expect(rows.map((r) => [r.attempt, r.statusCode, r.nextRetryAt !== null])).toEqual([
      [1, 500, true],
      [MAX_ATTEMPTS, 500, false],
    ]);
  });

  it('booking events fan out to subscribed endpoints only, once per event', async () => {
    await t.prisma.webhookEndpoint.updateMany({ where: { businessId: a.businessId }, data: { active: false } });
    const endpoint = await localEndpoint(a.businessId);
    await t.prisma.webhookEndpoint.create({
      data: { businessId: a.businessId, url: receiverUrl, events: ['booking.cancelled'], secretEncrypted: encrypt('x', config.ENCRYPTION_KEY) },
    });
    await publicBook(t, a.slug, { serviceId: a.serviceId, staffId: 'any', startsAt: ukTime(11, '09:00'), customer: customer() }).expect(201);
    const outbox = t.app.get(OutboxService);
    for (let i = 0; i < 50 && (await t.prisma.outboxEvent.count({ where: { processedAt: null } })) > 0; i++) {
      await new Promise((r) => setTimeout(r, 50));
    }
    await outbox.relay();
    const jobs = await queue.getJobs(['wait', 'delayed']);
    expect(jobs.map((j) => j.data.endpointId)).toEqual([endpoint.id]);
  });
});

describe('webhook endpoints: business isolation and secrets', () => {
  it("A cannot read, change, delete, test or read deliveries of B's endpoint, nor resend B's delivery", async () => {
    const endpoint = await localEndpoint(b.businessId);
    const delivery = await t.prisma.webhookDelivery.create({ data: { endpointId: endpoint.id, event: 'webhook.test', attempt: 1, payloadJson: {} } });
    await as(t, a).patch(`/api/v1/webhooks/${endpoint.id}`, { active: false }).expect(404);
    await as(t, a).delete(`/api/v1/webhooks/${endpoint.id}`).expect(404);
    await as(t, a).post(`/api/v1/webhooks/${endpoint.id}/test`).expect(404);
    await as(t, a).get(`/api/v1/webhooks/${endpoint.id}/deliveries`).expect(404);
    await as(t, a).post(`/api/v1/webhooks/deliveries/${delivery.id}/resend`).expect(404);
    const list = await as(t, a).get('/api/v1/webhooks').expect(200);
    expect(list.body.items.map((e: { id: string }) => e.id)).not.toContain(endpoint.id);
    expect((await t.prisma.webhookEndpoint.findUniqueOrThrow({ where: { id: endpoint.id } })).active).toBe(true);
  });

  it('the signing secret is shown once and stored encrypted (AES-256-GCM)', async () => {
    const res = await as(t, a).post('/api/v1/webhooks', { url: 'https://93.184.215.14/hooks' }).expect(201);
    expect(res.body.secret).toMatch(/^whsec_/);
    const row = await t.prisma.webhookEndpoint.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row.secretEncrypted).not.toContain(res.body.secret);
    expect(decrypt(row.secretEncrypted, config.ENCRYPTION_KEY)).toBe(res.body.secret);
    const list = await as(t, a).get('/api/v1/webhooks').expect(200);
    expect(JSON.stringify(list.body)).not.toContain(res.body.secret);
  });
});
