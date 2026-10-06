import { Inject, Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { eraseCustomer } from '../customers/customers.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const DAY_MS = 86_400_000;

export interface CleanupReport {
  idempotencyKeys: number;
  outboxEvents: number;
  webhookPayloads: number;
  sessions: number;
  authTokens: number;
  customersErased: number;
}

/**
 * Daily retention job (PRD F12): idempotency records after 24 h, processed outbox events and webhook payloads
 * after 30 days, expired sessions and tokens, and automatic erasure of customers whose last booking ended
 * more than the business's retention period ago.
 */
@Injectable()
export class CleanupService {
  private readonly log = new Logger('Cleanup');

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async run(now = new Date()): Promise<CleanupReport> {
    const ago = (days: number) => new Date(now.getTime() - days * DAY_MS);
    const [idempotencyKeys, outboxEvents, webhookPayloads, sessions, authTokens] = await Promise.all([
      this.prisma.idempotencyKey.deleteMany({ where: { createdAt: { lt: ago(1) } } }),
      this.prisma.outboxEvent.deleteMany({ where: { processedAt: { lt: ago(30) } } }),
      this.prisma.$executeRaw`UPDATE webhook_deliveries SET payload_json = NULL, updated_at = now()
                               WHERE created_at < ${ago(30)} AND payload_json IS NOT NULL`,
      this.prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }),
      this.prisma.authToken.deleteMany({ where: { OR: [{ expiresAt: { lt: ago(1) } }, { usedAt: { lt: ago(1) } }] } }),
    ]);
    const customersErased = await this.eraseExpiredCustomers(now);
    const report = {
      idempotencyKeys: idempotencyKeys.count,
      outboxEvents: outboxEvents.count,
      webhookPayloads,
      sessions: sessions.count,
      authTokens: authTokens.count,
      customersErased,
    };
    this.log.log(`cleanup ${JSON.stringify(report)}`);
    return report;
  }

  /** Customers with no booking ending after (now − retention months) of their business. */
  private async eraseExpiredCustomers(now: Date): Promise<number> {
    const businesses = await this.prisma.business.findMany({ select: { id: true, retentionMonths: true } });
    let erased = 0;
    for (const b of businesses) {
      const cutoff = new Date(now);
      cutoff.setUTCMonth(cutoff.getUTCMonth() - b.retentionMonths);
      const stale = await this.prisma.customer.findMany({
        where: { businessId: b.id, erasedAt: null, bookings: { none: { endsAt: { gte: cutoff } } } },
        select: { id: true },
        take: 1000,
      });
      for (const c of stale) {
        await this.prisma.$transaction((tx) => eraseCustomer(tx, this.audit, b.id, c.id, { actorType: 'system', actorId: null }));
        erased++;
      }
    }
    return erased;
  }
}
