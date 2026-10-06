import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ErrorCode } from '@slotwise/shared';
import { ALLOW, type AuthedRequest, type Caller, IS_PUBLIC } from '../common/auth.js';
import { ACCESS_COOKIE, readCookie } from '../common/cookies.js';
import { AppError, forbidden } from '../common/errors.js';
import { ApiKeyAuthenticator } from './api-key.authenticator.js';
import type { AccessPayload } from './sessions.service.js';

const unauthenticated = () => new AppError(401, ErrorCode.UNAUTHENTICATED, 'Please log in.');

/**
 * Global guard: deny by default. A route is reachable only if it is @Public() or lists its callers with
 * @Allow(...). Role checks happen here; ownership (businessId / staffId filters) happens in the services.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(ApiKeyAuthenticator) private readonly apiKeys: ApiKeyAuthenticator,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const allowed = this.reflector.getAllAndOverride<Caller[] | undefined>(ALLOW, targets);
    if (!allowed?.length) throw forbidden(); // a route that forgot to say who may call it is closed

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const authorization = req.get('authorization');

    if (authorization) {
      const match = /^Bearer (\S+)$/.exec(authorization);
      if (!match?.[1]) throw unauthenticated();
      const auth = await this.apiKeys.authenticate(match[1]);
      if (!allowed.includes('apiKey')) throw forbidden('API keys can’t use this endpoint.');
      req.auth = auth;
      return true;
    }

    const token = readCookie(req, ACCESS_COOKIE);
    if (!token) throw unauthenticated();
    let payload: AccessPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessPayload>(token);
    } catch {
      throw new AppError(401, ErrorCode.SESSION_EXPIRED, 'Your session has expired.');
    }
    if (!allowed.includes(payload.role)) throw forbidden();
    req.auth = {
      kind: 'user',
      userId: payload.sub,
      businessId: payload.bid,
      role: payload.role,
      staffId: payload.stf,
      isDemo: payload.demo,
    };
    return true;
  }
}
