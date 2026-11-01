import { ErrorCode } from '@slotwise/shared';
import { AppError } from './errors.js';

/**
 * Caps for demo businesses (`is_demo`), so a public demo can't be filled up between resets.
 * Real businesses have no such limits. Names and other text are already length-limited by the schemas.
 */
export const DEMO_LIMITS = { services: 20, staff: 15, bookings: 300, customers: 300 } as const;
export type DemoLimited = keyof typeof DEMO_LIMITS;

type Counter = { count: (args: { where: { businessId: string } }) => Promise<number> };
export interface DemoCounters {
  service: Counter;
  staff: Counter;
  booking: Counter;
  customer: Counter;
}

const MODEL: Record<DemoLimited, keyof DemoCounters> = { services: 'service', staff: 'staff', bookings: 'booking', customers: 'customer' };

export const demoLimit = (what: DemoLimited): AppError =>
  new AppError(
    403,
    ErrorCode.DEMO_LIMIT,
    `The demo clinic is limited to ${DEMO_LIMITS[what]} ${what}. It resets automatically, or run your own copy for more.`,
  );

/** Throws 403 DEMO_LIMIT when a demo business already has the maximum number of `what`. */
export async function assertDemoRoom(db: DemoCounters, businessId: string, what: DemoLimited): Promise<void> {
  const n = await db[MODEL[what]].count({ where: { businessId } });
  if (n >= DEMO_LIMITS[what]) throw demoLimit(what);
}
