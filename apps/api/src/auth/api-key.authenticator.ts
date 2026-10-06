import { Injectable } from '@nestjs/common';
import { ErrorCode } from '@slotwise/shared';
import type { AuthContext } from '../common/auth.js';
import { AppError } from '../common/errors.js';

/** Resolves `Authorization: Bearer sw_live_…` to a business. API keys arrive in the developer-API phase. */
@Injectable()
export class ApiKeyAuthenticator {
  async authenticate(_token: string): Promise<AuthContext> {
    throw new AppError(401, ErrorCode.UNAUTHENTICATED, 'Invalid API key.');
  }
}
