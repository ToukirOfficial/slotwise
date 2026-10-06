import { Body, Controller, Get, Inject, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  acceptInviteBodySchema,
  forgotPasswordBodySchema,
  loginBodySchema,
  type LoginBody,
  type Me,
  meSchema,
  okSchema,
  registerBodySchema,
  type RegisterBody,
  resetPasswordBodySchema,
  tokenBodySchema,
} from '@slotwise/shared';
import type { Request, Response } from 'express';
import { Allow, Auth, type AuthContext, Public } from '../common/auth.js';
import { clearAuthCookies, readCookie, REFRESH_COOKIE, setAuthCookies } from '../common/cookies.js';
import { sha256 } from '../common/crypto.js';
import { RateLimiter } from '../common/rate-limit.js';
import { Returns } from '../common/schema.js';
import { AuthService } from './auth.service.js';
import { SessionsService } from './sessions.service.js';

const OK = { ok: true } as const;

@ApiTags('Auth (dashboard)')
@Controller('v1/auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(SessionsService) private readonly sessions: SessionsService,
    @Inject(RateLimiter) private readonly limiter: RateLimiter,
  ) {}

  @Public()
  @Post('register')
  @Returns(meSchema, 201)
  async register(
    @Body({ schema: registerBodySchema }) body: RegisterBody,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Me> {
    await this.limiter.hit(`register:ip:${req.ip}`, 3, 60);
    const tokens = await this.auth.register(body);
    setAuthCookies(res, tokens.access, tokens.refresh);
    return this.auth.me(tokens.userId);
  }

  @Public()
  @Post('login')
  @Returns(meSchema)
  async login(
    @Body({ schema: loginBodySchema }) body: LoginBody,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Me> {
    await this.limiter.hit(`login:ip:${req.ip}`, 20, 60);
    await this.limiter.hit(`login:email:${sha256(body.email)}`, 5, 60);
    const tokens = await this.auth.login(body.email, body.password);
    setAuthCookies(res, tokens.access, tokens.refresh);
    return this.auth.me(tokens.userId);
  }

  @Public()
  @Post('refresh')
  @Returns(okSchema)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.limiter.hit(`refresh:ip:${req.ip}`, 60, 60);
    try {
      const tokens = await this.sessions.rotate(readCookie(req, REFRESH_COOKIE));
      setAuthCookies(res, tokens.access, tokens.refresh);
      return OK;
    } catch (err) {
      clearAuthCookies(res);
      throw err;
    }
  }

  @Public()
  @Post('logout')
  @Returns(okSchema)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.sessions.revokeFamilyOf(readCookie(req, REFRESH_COOKIE));
    clearAuthCookies(res);
    return OK;
  }

  @Public()
  @Post('verify-email')
  @Returns(okSchema)
  async verifyEmail(@Body({ schema: tokenBodySchema }) body: { token: string }, @Req() req: Request) {
    await this.limiter.hit(`token:ip:${req.ip}`, 20, 60);
    await this.auth.verifyEmail(body.token);
    return OK;
  }

  @Allow('owner')
  @Post('resend-verification')
  @Returns(okSchema)
  async resendVerification(@Auth() auth: AuthContext) {
    if (auth.kind !== 'user') return OK;
    await this.limiter.hit(`resend:user:${auth.userId}`, 3, 15 * 60);
    await this.auth.resendVerification(auth.userId);
    return OK;
  }

  @Public()
  @Post('forgot-password')
  @Returns(okSchema)
  async forgotPassword(@Body({ schema: forgotPasswordBodySchema }) body: { email: string }, @Req() req: Request) {
    await this.limiter.hit(`forgot:ip:${req.ip}`, 5, 15 * 60);
    await this.limiter.hit(`forgot:email:${sha256(body.email)}`, 3, 15 * 60);
    await this.auth.forgotPassword(body.email);
    return OK;
  }

  @Public()
  @Post('reset-password')
  @Returns(okSchema)
  async resetPassword(
    @Body({ schema: resetPasswordBodySchema }) body: { token: string; password: string },
    @Req() req: Request,
  ) {
    await this.limiter.hit(`token:ip:${req.ip}`, 20, 60);
    await this.auth.resetPassword(body.token, body.password);
    return OK;
  }

  @Public()
  @Post('accept-invite')
  @Returns(meSchema)
  async acceptInvite(
    @Body({ schema: acceptInviteBodySchema }) body: { token: string; password: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Me> {
    await this.limiter.hit(`token:ip:${req.ip}`, 20, 60);
    const tokens = await this.auth.acceptInvite(body.token, body.password);
    setAuthCookies(res, tokens.access, tokens.refresh);
    return this.auth.me(tokens.userId);
  }

  @Allow('owner', 'staff')
  @Get('me')
  @Returns(meSchema)
  me(@Auth() auth: AuthContext): Promise<Me> {
    if (auth.kind !== 'user') throw new Error('unreachable');
    return this.auth.me(auth.userId);
  }
}
