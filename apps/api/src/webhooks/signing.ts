import { createHmac, timingSafeEqual } from 'node:crypto';

export const SIGNATURE_HEADER = 'Slotwise-Signature';
export const TOLERANCE_SEC = 5 * 60;

/** `t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>` */
export function sign(secret: string, rawBody: string, t = Math.floor(Date.now() / 1000)): string {
  const v1 = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  return `t=${t},v1=${v1}`;
}

/**
 * How a receiver verifies a delivery (the same code is in the README). Rejects signatures older than five
 * minutes so a captured request can't be replayed later.
 */
export function verify(secret: string, rawBody: string, header: string, now = Math.floor(Date.now() / 1000)): boolean {
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]));
  const t = Number(parts.t);
  if (!Number.isInteger(t) || !parts.v1 || Math.abs(now - t) > TOLERANCE_SEC) return false;
  const expected = Buffer.from(createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex'), 'hex');
  const given = Buffer.from(parts.v1, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
