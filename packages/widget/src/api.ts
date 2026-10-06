import type { Availability, ErrorBody, PublicBooking, PublicBusiness } from '@slotwise/shared';

export class WidgetError extends Error {
  constructor(
    readonly status: number,
    readonly errorCode: string,
    message: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

/** Talks only to /api/v1/public/* on the server the script was loaded from. Holds no secrets. */
export class PublicApi {
  constructor(private readonly base: string) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.base}${path}`, { ...init, credentials: 'omit' });
    } catch {
      throw new WidgetError(0, 'NETWORK', 'Can’t reach the booking server. Check your connection and try again.');
    }
    const body = (await res.json().catch(() => ({}))) as Partial<ErrorBody>;
    if (!res.ok) throw new WidgetError(res.status, body.errorCode ?? 'INTERNAL', body.message ?? 'Something went wrong.', body.fields);
    return body as T;
  }

  business = (slug: string) => this.request<PublicBusiness>(`/${encodeURIComponent(slug)}`);

  availability = (slug: string, q: { serviceId: string; staffId: string; from: string; to: string }) =>
    this.request<Availability>(`/${encodeURIComponent(slug)}/availability?${new URLSearchParams(q).toString()}`);

  book = (
    slug: string,
    idempotencyKey: string,
    body: { serviceId: string; staffId: string; startsAt: string; customer: { name: string; email: string; phone: string } },
  ) =>
    this.request<PublicBooking>(`/${encodeURIComponent(slug)}/bookings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(body),
    });
}
