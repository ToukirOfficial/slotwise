import { type DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ApiKeyAuthenticator } from './auth/api-key.authenticator.js';
import { AvailabilityController } from './availability/availability.controller.js';
import { AvailabilityService } from './availability/availability.service.js';
import { PublicController } from './public/public.controller.js';
import { PublicService } from './public/public.service.js';
import { AuthController } from './auth/auth.controller.js';
import { AuthGuard } from './auth/auth.guard.js';
import { AuthService } from './auth/auth.service.js';
import { SessionsService } from './auth/sessions.service.js';
import { BusinessController } from './business/business.controller.js';
import { BusinessService } from './business/business.service.js';
import type { AppConfig } from './config.js';
import { CoreModule } from './core.module.js';
import { HealthController } from './health/health.controller.js';
import { ScheduleController } from './schedule/schedule.controller.js';
import { ScheduleService } from './schedule/schedule.service.js';
import { ServicesController } from './services/services.controller.js';
import { ServicesService } from './services/services.service.js';
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

@Module({ controllers: [ServicesController], providers: [ServicesService], exports: [ServicesService] })
class ServicesModule {}

@Module({ controllers: [ScheduleController], providers: [ScheduleService], exports: [ScheduleService] })
class ScheduleModule {}

@Module({ controllers: [AvailabilityController], providers: [AvailabilityService], exports: [AvailabilityService] })
class AvailabilityModule {}

@Module({ imports: [AvailabilityModule], controllers: [PublicController], providers: [PublicService], exports: [PublicService] })
class PublicModule {}

/** The HTTP API (src/main.ts). */
@Module({})
export class AppModule {
  static forConfig(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [CoreModule.forConfig(config), AuthModule, BusinessModule, StaffModule, ServicesModule, ScheduleModule, AvailabilityModule, PublicModule],
      controllers: [HealthController],
      providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
    };
  }
}
