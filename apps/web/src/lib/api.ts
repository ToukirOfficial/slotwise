import type { ErrorBody } from '@slotwise/shared';

/** An error response from the API, with its stable errorCode and per-field messages. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly errorCode: string,
    message: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

interface Options {
  method?: Method;
  body?: unknown;
  headers?: Record<string, string>;
  /** Don't try a token refresh / redirect on 401 (auth pages). */
  noRefresh?: boolean;
}

let refreshing: Promise<boolean> | null = null;

/** One refresh at a time: two parallel 401s must not both rotate the refresh token (that looks like reuse). */
const refreshSession = (): Promise<boolean> => {
  refreshing ??= fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'same-origin' })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      setTimeout(() => (refreshing = null), 0);
    });
  return refreshing;
};

const toLogin = () => {
  if (typeof window === 'undefined') return;
  const next = window.location.pathname + window.location.search;
  // A full page load on purpose: it drops every piece of in-memory state from the old session.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(`/login?next=${encodeURIComponent(next)}`);
};

/** Calls the NestJS API through the same-origin /api rewrite. Cookies carry the session. */
export async function api<T>(path: string, opts: Options = {}): Promise<T> {
  const send = () =>
    fetch(`/api/v1${path}`, {
      method: opts.method ?? 'GET',
      credentials: 'same-origin',
      headers: { ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}), ...opts.headers },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });

  let res = await send();
  if (res.status === 401 && !opts.noRefresh) {
    if (await refreshSession()) res = await send();
    if (res.status === 401) {
      toLogin();
      throw new ApiError(401, 'UNAUTHENTICATED', 'Please log in.');
    }
  }
  const text = await res.text();
  const data: unknown = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = (data ?? {}) as Partial<ErrorBody>;
    throw new ApiError(res.status, err.errorCode ?? 'INTERNAL', err.message ?? 'Something went wrong.', err.fields);
  }
  return data as T;
}

/** A user-facing message for any thrown value. */
export const errorMessage = (err: unknown): string =>
  err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';

/** A random Idempotency-Key for one user action (reused if the same action is retried). */
export const newIdempotencyKey = (): string => crypto.randomUUID();
