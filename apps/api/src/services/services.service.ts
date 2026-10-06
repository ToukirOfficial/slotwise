import { Inject, Injectable } from '@nestjs/common';
import { type CreateServiceBody, ErrorCode, type Service, type UpdateServiceBody } from '@slotwise/shared';
import { PublicCache } from '../business/public-cache.js';
import type { AuthContext } from '../common/auth.js';
import { AppError, notFound } from '../common/errors.js';
import { idPage, toPage } from '../common/pagination.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const include = { staff: { select: { staffId: true } } } satisfies Prisma.ServiceInclude;
type ServiceRow = Prisma.ServiceGetPayload<{ include: typeof include }>;

const toDto = (s: ServiceRow): Service => ({
  id: s.id,
  name: s.name,
  durationMin: s.durationMin,
  bufferBeforeMin: s.bufferBeforeMin,
  bufferAfterMin: s.bufferAfterMin,
  pricePence: s.pricePence,
  active: s.active,
  staffIds: s.staff.map((x) => x.staffId),
});

@Injectable()
export class ServicesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PublicCache) private readonly cache: PublicCache,
  ) {}

  async list(auth: AuthContext, q: { cursor?: string; limit: number; active?: 'true' | 'false' }) {
    const page = idPage(q);
    const rows = await this.prisma.service.findMany({
      ...page,
      where: { ...page.where, businessId: auth.businessId, ...(q.active ? { active: q.active === 'true' } : {}) },
      include,
    });
    return toPage(rows, q.limit, toDto);
  }

  async get(auth: AuthContext, id: string): Promise<Service> {
    return toDto(await this.find(auth.businessId, id));
  }

  async create(auth: AuthContext, body: CreateServiceBody): Promise<Service> {
    const s = await this.prisma.service.create({ data: { ...body, businessId: auth.businessId }, include });
    await this.cache.forgetBusiness(auth.businessId);
    return toDto(s);
  }

  async update(auth: AuthContext, id: string, body: UpdateServiceBody): Promise<Service> {
    await this.find(auth.businessId, id);
    // Bookings keep their own snapshot of name, length, buffers and price, so this never changes them.
    const s = await this.prisma.service.update({ where: { id }, data: body, include });
    await this.cache.forgetBusiness(auth.businessId);
    return toDto(s);
  }

  async remove(auth: AuthContext, id: string): Promise<void> {
    await this.find(auth.businessId, id);
    try {
      await this.prisma.service.delete({ where: { id } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        throw new AppError(409, ErrorCode.CONFLICT, 'This service has bookings. Switch it off instead.');
      }
      throw err;
    }
    await this.cache.forgetBusiness(auth.businessId);
  }

  async find(businessId: string, id: string): Promise<ServiceRow> {
    const s = await this.prisma.service.findFirst({ where: { id, businessId }, include });
    if (!s) throw notFound('Service not found.');
    return s;
  }
}
