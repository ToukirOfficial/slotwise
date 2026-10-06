import { type DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ApiKeyAuthenticator } from './auth/api-key.authenticator.js';
import { AuditController } from './audit/audit.controller.js';
import { AuditService } from './audit/audit.service.js';
import { AvailabilityController } from './availability/availability.controller.js';
import { BookingsController } from './bookings/bookings.controller.js';
import { BookingsService } from './bookings/bookings.service.js';
import { IdempotencyService } from './bookings/idempotency.service.js';
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

@Module({ controllers: [AuditController], providers: [AuditService], exports: [AuditService] })
class AuditModule {}

@Module({
  imports: [AvailabilityModule, AuditModule],
  controllers: [BookingsController],
  providers: [BookingsService, IdempotencyService],
  exports: [BookingsService],
})
class BookingsModule {}

@Module({
  imports: [AvailabilityModule, BookingsModule],
  controllers: [PublicController],
  providers: [PublicService],
  exports: [PublicService],
})
class PublicModule {}

/** The HTTP API (src/main.ts). */
@Module({})
export class AppModule {
  static forConfig(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [CoreModule.forConfig(config), AuthModule, BusinessModule, StaffModule, ServicesModule, ScheduleModule, AvailabilityModule, AuditModule, BookingsModule, PublicModule],
      controllers: [HealthController],
      providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
    };
  }
}
