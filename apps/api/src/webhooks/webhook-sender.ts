import http from 'node:http';
import https from 'node:https';
import type { LookupFunction } from 'node:net';
import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { SIGNATURE_HEADER, sign } from './signing.js';
import { UrlRejected, vetUrl } from './ssrf.js';

export interface AttemptResult {
  ok: boolean;
  statusCode: number | null;
  durationMs: number;
  error: string | null;
  responseExcerpt: string | null;
}

const TIMEOUT_MS = 10_000;
const EXCERPT_BYTES = 1024;

/**
 * One signed POST. SSRF rules: the URL is vetted (HTTPS in production, every DNS answer public), the socket
 * connects to the vetted IP only, redirects are not followed (a 3xx is a failure), 10 s timeout, and only the
 * first 1 KB of the response is kept for the log.
 */
@Injectable()
export class WebhookSender {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async post(url: string, secret: string, body: string): Promise<AttemptResult> {
    const started = Date.now();
    const done = (r: Omit<AttemptResult, 'durationMs'>): AttemptResult => ({ ...r, durationMs: Date.now() - started });

    let vetted;
    try {
      vetted = await vetUrl(url, {
        production: this.config.NODE_ENV === 'production',
        allowPrivate: this.config.WEBHOOK_ALLOW_PRIVATE,
      });
    } catch (err) {
      const message = err instanceof UrlRejected ? `URL rejected: ${err.message}` : 'URL rejected';
      return done({ ok: false, statusCode: null, error: message, responseExcerpt: null });
    }

    // Pin the connection to the address we checked (no second DNS lookup that could return 127.0.0.1).
    const pinned: LookupFunction = (_host, opts, cb) =>
      opts.all
        ? (cb as unknown as (e: null, a: { address: string; family: number }[]) => void)(null, [
            { address: vetted.address, family: vetted.family },
          ])
        : cb(null, vetted.address, vetted.family);
    const client = vetted.url.protocol === 'https:' ? https : http;

    return new Promise<AttemptResult>((resolve) => {
      const req = client.request(
        vetted.url,
        {
          method: 'POST',
          lookup: pinned,
          timeout: TIMEOUT_MS,
          headers: {
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(body),
            'user-agent': 'Slotwise-Webhooks/1',
            [SIGNATURE_HEADER]: sign(secret, body),
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          let size = 0;
          res.on('data', (c: Buffer) => {
            if (size < EXCERPT_BYTES) chunks.push(c);
            size += c.length;
          });
          res.on('end', () => {
            const status = res.statusCode ?? 0;
            const excerpt = Buffer.concat(chunks).subarray(0, EXCERPT_BYTES).toString('utf8');
            const ok = status >= 200 && status < 300;
            resolve(
              done({
                ok,
                statusCode: status,
                error: ok ? null : status >= 300 && status < 400 ? 'Redirects are not followed' : `HTTP ${status}`,
                responseExcerpt: excerpt || null,
              }),
            );
          });
          res.on('error', (e) => resolve(done({ ok: false, statusCode: res.statusCode ?? null, error: e.message, responseExcerpt: null })));
        },
      );
      req.on('timeout', () => req.destroy(new Error(`Timed out after ${TIMEOUT_MS / 1000} s`)));
      req.on('error', (e) => resolve(done({ ok: false, statusCode: null, error: e.message, responseExcerpt: null })));
      req.end(body);
    });
  }
}
