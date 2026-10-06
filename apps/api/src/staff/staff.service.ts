import { Inject, Injectable } from '@nestjs/common';
import { ErrorCode, type PageQuery, type Staff } from '@slotwise/shared';
import { type AuthContext } from '../common/auth.js';
import { AppError, notFound } from '../common/errors.js';
import { idPage, toPage } from '../common/pagination.js';
import { Prisma } from '../generated/prisma/client.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const include = {
  user: { select: { email: true, passwordHash: true } },
} satisfies Prisma.StaffInclude;
type StaffRow = Prisma.StaffGetPayload<{ include: typeof include }>;

const demoRestricted = () =>
  new AppError(403, ErrorCode.DEMO_RESTRICTED, 'The demo business can’t invite people.');

@Injectable()
export class StaffService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  /** Login emails are shown to owners only. */
  private toDto(auth: AuthContext, s: StaffRow): Staff {
    const isOwner = auth.kind === 'user' && auth.role === 'owner';
    return {
      id: s.id,
      displayName: s.displayName,
      active: s.active,
      email: isOwner ? (s.user?.email ?? null) : null,
      hasLogin: Boolean(s.user?.passwordHash),
      invitePending: Boolean(s.user && !s.user.passwordHash),
      serviceIds: [],
    };
  }

  async list(auth: AuthContext, q: PageQuery) {
    const page = idPage(q);
    const rows = await this.prisma.staff.findMany({
      ...page,
      where: { ...page.where, businessId: auth.businessId },
      include,
    });
    return toPage(rows, q.limit, (r) => this.toDto(auth, r));
  }

  async get(auth: AuthContext, id: string): Promise<Staff> {
    return this.toDto(auth, await this.find(auth.businessId, id));
  }

  async create(auth: AuthContext, displayName: string): Promise<Staff> {
    const s = await this.prisma.staff.create({ data: { businessId: auth.businessId, displayName }, include });
    return this.toDto(auth, s);
  }

  async update(auth: AuthContext, id: string, data: { displayName?: string; active?: boolean }): Promise<Staff> {
    await this.find(auth.businessId, id);
    const s = await this.prisma.staff.update({ where: { id }, data, include });
    return this.toDto(auth, s);
  }

  /** Staff with bookings can't be deleted (their history matters); deactivate them instead. */
  async remove(auth: AuthContext, id: string): Promise<void> {
    const s = await this.find(auth.businessId, id);
    if (auth.kind === 'user' && s.id === auth.staffId) {
      throw new AppError(409, ErrorCode.CONFLICT, 'You can’t delete your own staff profile. Deactivate it instead.');
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.staff.delete({ where: { id } });
        // A staff-role login with no staff profile could see nothing: remove it too.
        if (s.userId) await tx.user.deleteMany({ where: { id: s.userId, role: 'staff' } });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        throw new AppError(409, ErrorCode.CONFLICT, 'This person has bookings. Deactivate them instead.');
      }
      throw err;
    }
  }

  /** Creates (or re-sends) a login invite. An email can belong to one login only. */
  async invite(auth: AuthContext, id: string, email: string): Promise<Staff> {
    if (auth.isDemo) throw demoRestricted();
    const staff = await this.find(auth.businessId, id);
    if (staff.user?.passwordHash) {
      throw new AppError(409, ErrorCode.CONFLICT, 'This person already has a login.');
    }

    const eventId = await this.prisma.$transaction(async (tx) => {
      const holder = await tx.user.findUnique({ where: { email } });
      if (holder && holder.id !== staff.userId) {
        throw new AppError(409, ErrorCode.EMAIL_TAKEN, 'That email is already used by another login.', {
          email: 'Already in use',
        });
      }
      const user = staff.userId
        ? await tx.user.update({ where: { id: staff.userId }, data: { email } })
        : await tx.user.create({ data: { businessId: auth.businessId, email, role: 'staff' } });
      if (!staff.userId) await tx.staff.update({ where: { id }, data: { userId: user.id } });
      // Older invite links stop working once a new one is sent.
      await tx.authToken.updateMany({
        where: { userId: user.id, kind: 'staff_invite', usedAt: null },
        data: { usedAt: new Date() },
      });
      return this.outbox.add(tx, auth.businessId, { type: 'auth.staff_invite', userId: user.id });
    });
    this.outbox.dispatchSoon([eventId]);
    return this.get(auth, id);
  }

  /** Tenant-scoped fetch: another business's id is simply not found. */
  async find(businessId: string, id: string): Promise<StaffRow> {
    const s = await this.prisma.staff.findFirst({ where: { id, businessId }, include });
    if (!s) throw notFound('Staff member not found.');
    return s;
  }
}
