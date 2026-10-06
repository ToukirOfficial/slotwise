/**
 * True if `err` is PostgreSQL refusing an overlapping booking (exclusion_violation on bookings_no_overlap).
 *
 * With Prisma 7 + @prisma/adapter-pg, SQLSTATE 23P01 has no Prisma "P" code of its own: the database error
 * arrives in `meta.driverAdapterError.cause`. This is the only place that knows that shape, and an
 * integration test checks it against a real PostgreSQL error (never a mocked one).
 */
export const SLOT_CONSTRAINT = 'bookings_no_overlap';

export function isSlotConflict(err: unknown): boolean {
  const cause = (err as { meta?: { driverAdapterError?: { cause?: { originalCode?: unknown; originalMessage?: unknown } } } })
    ?.meta?.driverAdapterError?.cause;
  return (
    cause?.originalCode === '23P01' &&
    typeof cause.originalMessage === 'string' &&
    cause.originalMessage.includes(`"${SLOT_CONSTRAINT}"`)
  );
}
