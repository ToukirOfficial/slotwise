import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';

/** Who is calling. businessId only ever comes from here — never from the URL or body. */
export type AuthContext =
  | {
      kind: 'user';
      userId: string;
      businessId: string;
      role: 'owner' | 'staff';
      /** The staff row linked to this login, if any. Staff-role queries are filtered by it. */
      staffId: string | null;
      isDemo: boolean;
    }
  | { kind: 'apiKey'; apiKeyId: string; businessId: string; isDemo: boolean };

export type AuthedRequest = Request & { auth?: AuthContext };

/** Callers a route accepts. A route without @Allow() or @Public() is refused (deny by default). */
export type Caller = 'owner' | 'staff' | 'apiKey';

export const IS_PUBLIC = 'slotwise:public';
export const ALLOW = 'slotwise:allow';

export const Public = () => SetMetadata(IS_PUBLIC, true);
export const Allow = (...callers: Caller[]) => SetMetadata(ALLOW, callers);

export const Auth = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthContext => {
  const auth = ctx.switchToHttp().getRequest<AuthedRequest>().auth;
  if (!auth) throw new Error('Auth() used on a route without authentication');
  return auth;
});

/** Staff-role logins only see their own diary. Returns the staffId to filter by, or null for owners/API keys. */
export const ownStaffFilter = (auth: AuthContext): string | null =>
  auth.kind === 'user' && auth.role === 'staff' ? (auth.staffId ?? '00000000-0000-0000-0000-000000000000') : null;

export const actorOf = (auth: AuthContext): { actorType: 'user' | 'api_key'; actorId: string } =>
  auth.kind === 'user' ? { actorType: 'user', actorId: auth.userId } : { actorType: 'api_key', actorId: auth.apiKeyId };
