import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

/**
 * Addresses a webhook may never reach: loopback, private networks, link-local (incl. cloud metadata at
 * 169.254.169.254), CGNAT, multicast, reserved and documentation ranges, and the IPv6 equivalents.
 * Without this, anyone with an account could make the server call its own Redis or other local services.
 */
const blocked = new BlockList();
for (const [net, bits] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blocked.addSubnet(net, bits, 'ipv4');
}
for (const [net, bits] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['100::', 64],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  blocked.addSubnet(net, bits, 'ipv6');
}

export function isBlockedAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return blocked.check(ip, 'ipv4');
  if (family === 6) {
    // IPv4-mapped (::ffff:a.b.c.d) is checked as IPv4. (A '::ffff:0:0/96' rule would make Node's BlockList
    // match every IPv4 address, public ones included.)
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
    if (mapped?.[1]) return blocked.check(mapped[1], 'ipv4');
    // The same, as URLs normalise it: ::ffff:7f00:1 → 127.0.0.1
    const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(ip);
    if (hex?.[1] && hex[2]) {
      const [hi, lo] = [Number.parseInt(hex[1], 16), Number.parseInt(hex[2], 16)];
      return blocked.check(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`, 'ipv4');
    }
    return blocked.check(ip, 'ipv6');
  }
  return true; // not an IP at all
}

export class UrlRejected extends Error {}

export interface VettedUrl {
  url: URL;
  /** The address to connect to (checked), so a second DNS answer can't swap it for an internal one. */
  address: string;
  family: 4 | 6;
}

/**
 * Checks a webhook URL right before sending. HTTPS only in production. The host is resolved here and EVERY
 * answer must be public; the caller then connects to the vetted address (no re-resolution).
 */
export async function vetUrl(raw: string, opts: { production: boolean; allowPrivate: boolean }): Promise<VettedUrl> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UrlRejected('Not a valid URL');
  }
  if (url.protocol !== 'https:' && (opts.production || url.protocol !== 'http:')) throw new UrlRejected('HTTPS is required');
  if (url.username || url.password) throw new UrlRejected('Credentials in the URL are not allowed');

  const host = url.hostname.replace(/^\[|\]$/g, '');
  const answers = isIP(host) ? [{ address: host, family: isIP(host) as 4 | 6 }] : await lookup(host, { all: true }).catch(() => []);
  if (answers.length === 0) throw new UrlRejected('The host name doesn’t resolve');
  if (!opts.allowPrivate && answers.some((a) => isBlockedAddress(a.address))) {
    throw new UrlRejected('That address is private or reserved');
  }
  const first = answers[0]!;
  return { url, address: first.address, family: first.family as 4 | 6 };
}
