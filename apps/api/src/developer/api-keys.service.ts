import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { type ApiKey, type CreatedApiKey, ErrorCode, type PageQuery } from '@slotwise/shared';
import type { AuthContext } from '../common/auth.js';
import { randomToken, sha256 } from '../common/crypto.js';
import { AppError, notFound } from '../common/errors.js';
import { idPage, toPage } from '../common/pagination.js';
import type { ApiKey as ApiKeyRow } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const toDto = (k: ApiKeyRow): ApiKey => ({
  id: k.id,
  name: k.name,
  prefix: k.prefix,
  lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
  revokedAt: k.revokedAt?.toISOString() ?? null,
  createdAt: k.createdAt.toISOString(),
});

export const demoRestricted = (what: string) =>
  new AppError(403, ErrorCode.DEMO_RESTRICTED, `The demo business can’t create ${what}.`);

@Injectable()
export class ApiKeysService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(auth: AuthContext, q: PageQuery) {
    const page = idPage(q);
    const rows = await this.prisma.apiKey.findMany({ ...page, where: { ...page.where, businessId: auth.businessId } });
    return toPage(rows, q.limit, toDto);
  }

  /** The full key is returned once; only the prefix and the secret's hash are kept. */
  async create(auth: AuthContext, name: string): Promise<CreatedApiKey> {
    if (auth.isDemo) throw demoRestricted('API keys');
    const prefix = randomBytes(6).toString('hex');
    const secret = randomToken();
    const row = await this.prisma.apiKey.create({
      data: { businessId: auth.businessId, name, prefix, keyHash: sha256(secret) },
    });
    return { ...toDto(row), key: `sw_live_${prefix}_${secret}` };
  }

  /** Revoking is permanent; the row stays so the owner can see when it was last used. */
  async revoke(auth: AuthContext, id: string): Promise<ApiKey> {
    const key = await this.prisma.apiKey.findFirst({ where: { id, businessId: auth.businessId } });
    if (!key) throw notFound('API key not found.');
    const row = key.revokedAt ? key : await this.prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
    return toDto(row);
  }
}
