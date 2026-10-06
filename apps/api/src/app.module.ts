import { type DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ApiKeyAuthenticator } from './auth/api-key.authenticator.js';
import { AuthController } from './auth/auth.controller.js';
import { AuthGuard } from './auth/auth.guard.js';
import { AuthService } from './auth/auth.service.js';
import { SessionsService } from './auth/sessions.service.js';
import { BusinessController } from './business/business.controller.js';
import { BusinessService } from './business/business.service.js';
import type { AppConfig } from './config.js';
import { CoreModule } from './core.module.js';
import { HealthController } from './health/health.controller.js';
import { StaffController } from './staff/staff.controller.js';
import { StaffService } from './staff/staff.service.js';

@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionsService, ApiKeyAuthenticator],
  exports: [SessionsService, ApiKeyAuthenticator],
})
class AuthModule {}

@Module({ controllers: [BusinessController], providers: [BusinessService], exports: [BusinessService] })
class BusinessModule {}

@Module({ controllers: [StaffController], providers: [StaffService], exports: [StaffService] })
class StaffModule {}

/** The HTTP API (src/main.ts). */
@Module({})
export class AppModule {
  static forConfig(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [CoreModule.forConfig(config), AuthModule, BusinessModule, StaffModule],
      controllers: [HealthController],
      providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
    };
  }
}
