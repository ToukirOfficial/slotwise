import { Inject, Injectable } from '@nestjs/common';
import type { AuditEntry, PageQuery } from '@slotwise/shared';
import { idPage, toPage } from '../common/pagination.js';
import type { ActorType, Prisma } from '../generated/prisma/client.js';
import { PrismaService, type Tx } from '../prisma/prisma.service.js';

export interface Actor {
  actorType: ActorType;
  actorId: string | null;
}

/** Append-only audit trail. Callers pass ids, status and times only — never names, emails or phones. */
@Injectable()
export class AuditService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  record(
    tx: Tx,
    entry: {
      businessId: string;
      actor: Actor;
      action: string;
      entity: string;
      entityId: string;
      before?: Prisma.InputJsonValue | null;
      after?: Prisma.InputJsonValue | null;
    },
  ) {
    return tx.auditLog.create({
      data: {
        businessId: entry.businessId,
        actorType: entry.actor.actorType,
        actorId: entry.actor.actorId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        ...(entry.before ? { beforeJson: entry.before } : {}),
        ...(entry.after ? { afterJson: entry.after } : {}),
      },
    });
  }

  async list(businessId: string, q: PageQuery & { entity?: string; entityId?: string }) {
    const page = idPage(q);
    // Newest first: the cursor moves backwards through UUIDv7 ids.
    const rows = await this.prisma.auditLog.findMany({
      where: {
        businessId,
        ...(q.entity ? { entity: q.entity } : {}),
        ...(q.entityId ? { entityId: q.entityId } : {}),
        ...(q.cursor ? { id: { lt: q.cursor } } : {}),
      },
      orderBy: { id: 'desc' },
      take: page.take,
    });
    return toPage(
      rows,
      q.limit,
      (r): AuditEntry => ({
        id: r.id,
        actorType: r.actorType,
        actorId: r.actorId,
        action: r.action,
        entity: r.entity,
        entityId: r.entityId,
        before: r.beforeJson ?? null,
        after: r.afterJson ?? null,
        at: r.at.toISOString(),
      }),
    );
  }
}
