import { Inject, Injectable } from '@nestjs/common';
import { type Customer, ErrorCode } from '@slotwise/shared';
import { AuditService, type Actor } from '../audit/audit.service.js';
import { AppError, notFound } from '../common/errors.js';
import { idPage, toPage } from '../common/pagination.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService, type Tx } from '../prisma/prisma.service.js';

const select = {
  id: true,
  name: true,
  email: true,
  phone: true,
  erasedAt: true,
  _count: { select: { bookings: true } },
  bookings: { select: { startsAt: true }, orderBy: { startsAt: 'desc' }, take: 1 },
} satisfies Prisma.CustomerSelect;
type Row = Prisma.CustomerGetPayload<{ select: typeof select }>;

const toDto = (c: Row): Customer => ({
  id: c.id,
  name: c.name,
  email: c.email,
  phone: c.phone,
  erasedAt: c.erasedAt?.toISOString() ?? null,
  bookingCount: c._count.bookings,
  lastBookingAt: c.bookings[0]?.startsAt.toISOString() ?? null,
});

/** The only place personal data lives. Erasure blanks it; bookings keep anonymous times and service. */
@Injectable()
export class CustomersService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(businessId: string, q: { q?: string; cursor?: string; limit: number }) {
    const page = idPage(q);
    const rows = await this.prisma.customer.findMany({
      ...page,
      where: {
        ...page.where,
        businessId,
        ...(q.q
          ? {
              OR: [
                { name: { contains: q.q, mode: 'insensitive' } },
                { email: { contains: q.q, mode: 'insensitive' } },
                { phone: { contains: q.q } },
              ],
            }
          : {}),
      },
      select,
    });
    return toPage(rows, q.limit, toDto);
  }

  /** Owner-requested erasure (e.g. a GDPR request). Refused while they still have upcoming bookings. */
  async erase(businessId: string, customerId: string, actor: Actor): Promise<Customer> {
    const row = await this.prisma.$transaction(async (tx) => {
      const c = await tx.customer.findFirst({ where: { id: customerId, businessId } });
      if (!c) throw notFound('Customer not found.');
      if (!c.erasedAt) {
        const upcoming = await tx.booking.count({ where: { customerId, status: 'confirmed', endsAt: { gt: new Date() } } });
        if (upcoming > 0) {
          throw new AppError(409, ErrorCode.CONFLICT, 'This customer has upcoming bookings. Cancel them first, then erase.');
        }
        await eraseCustomer(tx, this.audit, businessId, customerId, actor);
      }
      return tx.customer.findUniqueOrThrow({ where: { id: customerId }, select });
    });
    return toDto(row);
  }
}

/** Blanks the personal fields and records it (ids only in the audit log, so it never needs rewriting). */
export async function eraseCustomer(tx: Tx, audit: AuditService, businessId: string, customerId: string, actor: Actor): Promise<void> {
  await tx.customer.update({
    where: { id: customerId },
    data: { name: null, email: null, emailNormalized: null, phone: null, erasedAt: new Date() },
  });
  await audit.record(tx, { businessId, actor, action: 'customer.erased', entity: 'customer', entityId: customerId });
}
