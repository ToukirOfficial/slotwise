import { hmacSha256 } from '../common/crypto.js';

/**
 * The manage-link token for a booking: 256 bits, HMAC-SHA256(MANAGE_TOKEN_SECRET, booking id).
 *
 * The database stores only its SHA-256 hash (a database leak reveals no working links). Deriving it, rather
 * than storing a random value, lets the worker rebuild the link for any email — confirmation, reminder,
 * reschedule — without the plain token ever sitting in the outbox, Redis or a table.
 * See docs/decisions/0004-manage-links.md.
 */
export const manageToken = (secret: string, bookingId: string): string =>
  hmacSha256(secret, `manage:${bookingId}`).toString('base64url');
