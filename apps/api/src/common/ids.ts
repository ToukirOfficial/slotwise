import { randomBytes } from 'node:crypto';

/**
 * UUIDv7 (RFC 9562): 48-bit Unix ms timestamp + random bits. Same format as Prisma's uuid(7), but available
 * before the insert — the booking id is needed up front to derive its manage-link token.
 */
export const uuidv7 = (now = Date.now()): string => {
  const b = randomBytes(16);
  b.writeUIntBE(now, 0, 6);
  b[6] = (b[6]! & 0x0f) | 0x70; // version 7
  b[8] = (b[8]! & 0x3f) | 0x80; // RFC 4122 variant
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
