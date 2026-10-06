import { Inject, Injectable } from '@nestjs/common';
import { ErrorCode, idempotencyKeySchema } from '@slotwise/shared';
import { sha256 } from '../common/crypto.js';
import { AppError } from '../common/errors.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService, type Tx } from '../prisma/prisma.service.js';

export interface IdempotentResult<T> {
  status: number;
  body: T;
  /** True when this is a stored response to an earlier identical request. */
  replayed: boolean;
}

/** JSON with sorted keys, so the same request always hashes the same. */
const stable = (v: unknown): string =>
  v === null || typeof v !== 'object'
    ? JSON.stringify(v)
    : Array.isArray(v)
      ? `[${v.map(stable).join(',')}]`
      : `{${Object.keys(v as object)
          .sort()
          .map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`)
          .join(',')}}`;

/**
 * Idempotency-Key handling for booking create and reschedule.
 *
 * The key row is inserted INSIDE the booking transaction, before the booking itself:
 * - a concurrent request with the same key blocks on the primary key until the first commits, then gets a
 *   unique violation and returns the stored response;
 * - if the first attempt fails (e.g. 409 slot taken) its transaction rolls back, key row included, so a retry
 *   is a genuine new attempt;
 * - the same key with a different request body is refused with 422.
 */
@Injectable()
export class IdempotencyService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * `prepare` runs first, outside the transaction (validation reads, so a transaction never waits on a second
   * pool connection); `work` runs inside it, right after the key row is inserted.
   */
  async run<T, P>(
    businessId: string,
    rawKey: string | undefined,
    request: unknown,
    prepare: () => Promise<P>,
    work: (tx: Tx, prepared: P) => Promise<{ status: number; body: T }>,
  ): Promise<IdempotentResult<T>> {
    if (!rawKey) {
      throw new AppError(400, ErrorCode.IDEMPOTENCY_KEY_REQUIRED, 'Send an Idempotency-Key header with this request.');
    }
    const parsed = idempotencyKeySchema.safeParse(rawKey);
    if (!parsed.success) {
      throw new AppError(400, ErrorCode.VALIDATION_FAILED, 'Invalid Idempotency-Key header.', {
        'idempotency-key': parsed.error.issues[0]?.message ?? 'Invalid',
      });
    }
    const key = parsed.data;
    const requestHash = sha256(stable(request));
    const where = { businessId_key: { businessId, key } };

    const existing = await this.prisma.idempotencyKey.findUnique({ where });
    if (existing) return this.replay<T>(existing, requestHash);

    const prepared = await prepare();
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await tx.idempotencyKey.create({
            data: { businessId, key, requestHash, responseStatus: 0, responseJson: {} },
          });
          const result = await work(tx, prepared);
          await tx.idempotencyKey.update({
            where,
            data: { responseStatus: result.status, responseJson: JSON.parse(JSON.stringify(result.body)) },
          });
          return { ...result, replayed: false };
        },
        { timeout: 20_000, maxWait: 20_000 },
      );
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const row = await this.prisma.idempotencyKey.findUnique({ where });
        if (row) return this.replay<T>(row, requestHash);
      }
      throw err;
    }
  }

  private replay<T>(row: { requestHash: string; responseStatus: number; responseJson: unknown }, requestHash: string) {
    if (row.requestHash !== requestHash) {
      throw new AppError(
        422,
        ErrorCode.IDEMPOTENCY_KEY_REUSED,
        'This Idempotency-Key was already used for a different request.',
      );
    }
    return { status: row.responseStatus, body: row.responseJson as T, replayed: true };
  }
}
