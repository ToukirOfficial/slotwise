import { Inject, Injectable } from '@nestjs/common';
import { type CreateOverrideBody, type DateOverride, ErrorCode, type WeeklyHours } from '@slotwise/shared';
import { Temporal } from 'temporal-polyfill';
import type { AuthContext } from '../common/auth.js';
import { AppError, notFound } from '../common/errors.js';
import { BUSINESS_ZONE, dateColumn, fromDateColumn, todayIn } from '../common/time.js';
import type { DateOverride as OverrideRow } from '../generated/prisma/client.js';
import { PrismaService, type Tx } from '../prisma/prisma.service.js';

const toOverride = (o: OverrideRow): DateOverride => ({
  id: o.id,
  date: fromDateColumn(o.date),
  closed: o.closed,
  startMin: o.startMin,
  endMin: o.endMin,
});

/** Weekly hours and date overrides. Owners manage anyone in their business; staff only themselves. */
@Injectable()
export class ScheduleService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getWeekly(auth: AuthContext, staffId: string): Promise<WeeklyHours> {
    await this.assertAccess(auth, staffId);
    const rows = await this.prisma.weeklyHours.findMany({
      where: { staffId },
      orderBy: [{ weekday: 'asc' }, { startMin: 'asc' }],
    });
    return { hours: rows.map((r) => ({ weekday: r.weekday, startMin: r.startMin, endMin: r.endMin })) };
  }

  /** Replaces the whole week in one transaction. Existing bookings are never touched (PRD F3). */
  async putWeekly(auth: AuthContext, staffId: string, hours: WeeklyHours['hours']): Promise<WeeklyHours> {
    await this.assertAccess(auth, staffId);
    await this.prisma.$transaction(async (tx) => {
      await this.lockStaff(tx, staffId);
      await tx.weeklyHours.deleteMany({ where: { staffId } });
      await tx.weeklyHours.createMany({ data: hours.map((h) => ({ staffId, ...h })) });
    });
    return this.getWeekly(auth, staffId);
  }

  async listOverrides(auth: AuthContext, staffId: string, q: { from?: string; to?: string }) {
    await this.assertAccess(auth, staffId);
    const from = q.from ?? todayIn(BUSINESS_ZONE).toString();
    const to = q.to ?? Temporal.PlainDate.from(from).add({ days: 365 }).toString();
    const rows = await this.prisma.dateOverride.findMany({
      where: { staffId, date: { gte: dateColumn(from), lte: dateColumn(to) } },
      orderBy: [{ date: 'asc' }, { startMin: 'asc' }],
    });
    return { items: rows.map(toOverride) };
  }

  /** A date is either closed (one row) or has one or more non-overlapping windows. */
  async createOverride(auth: AuthContext, staffId: string, body: CreateOverrideBody): Promise<DateOverride> {
    await this.assertAccess(auth, staffId);
    const row = await this.prisma.$transaction(async (tx) => {
      await this.lockStaff(tx, staffId); // serialises concurrent edits of one person's diary
      const sameDay = await tx.dateOverride.findMany({ where: { staffId, date: dateColumn(body.date) } });
      const conflict = body.closed
        ? sameDay.length > 0
        : sameDay.some((o) => o.closed || (o.startMin! < body.endMin && body.startMin < o.endMin!));
      if (conflict) {
        throw new AppError(
          409,
          ErrorCode.CONFLICT,
          body.closed
            ? 'That date already has special hours. Remove them first.'
            : 'That overlaps hours already set for that date.',
        );
      }
      return tx.dateOverride.create({
        data: body.closed
          ? { staffId, date: dateColumn(body.date), closed: true }
          : { staffId, date: dateColumn(body.date), closed: false, startMin: body.startMin, endMin: body.endMin },
      });
    });
    return toOverride(row);
  }

  async deleteOverride(auth: AuthContext, staffId: string, overrideId: string): Promise<void> {
    await this.assertAccess(auth, staffId);
    const { count } = await this.prisma.dateOverride.deleteMany({ where: { id: overrideId, staffId } });
    if (count === 0) throw notFound('Override not found.');
  }

  /** Tenant check, plus: a staff-role login may only touch its own diary. Both fail as 404. */
  private async assertAccess(auth: AuthContext, staffId: string): Promise<void> {
    if (auth.kind === 'user' && auth.role === 'staff' && auth.staffId !== staffId) throw notFound('Staff member not found.');
    const staff = await this.prisma.staff.findFirst({ where: { id: staffId, businessId: auth.businessId }, select: { id: true } });
    if (!staff) throw notFound('Staff member not found.');
  }

  private lockStaff(tx: Tx, staffId: string) {
    return tx.$queryRaw`SELECT id FROM staff WHERE id = ${staffId}::uuid FOR UPDATE`;
  }
}
