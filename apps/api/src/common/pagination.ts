import { ErrorCode, type PageQuery } from '@slotwise/shared';
import { AppError } from './errors.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Keyset pagination on UUIDv7 ids (they sort by creation time). Use with `orderBy: { id: 'asc' }`.
 * Fetches one extra row to know whether there is a next page.
 */
export const idPage = (q: PageQuery) => {
  if (q.cursor !== undefined && !UUID.test(q.cursor)) {
    throw new AppError(400, ErrorCode.VALIDATION_FAILED, 'Invalid cursor.', { cursor: 'Invalid cursor' });
  }
  return {
    where: q.cursor ? { id: { gt: q.cursor } } : {},
    take: q.limit + 1,
    orderBy: { id: 'asc' as const },
  };
};

export const toPage = <Row extends { id: string }, Item>(rows: Row[], limit: number, map: (r: Row) => Item) => {
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  return { items: pageRows.map(map), nextCursor: hasMore ? (pageRows.at(-1)?.id ?? null) : null };
};
