import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { auditEntrySchema, auditQuerySchema, pageOf } from '@slotwise/shared';
import { Allow, Auth, type AuthContext } from '../common/auth.js';
import { Returns } from '../common/schema.js';
import { AuditService } from './audit.service.js';

@ApiTags('Audit log (dashboard)')
@Controller('v1/audit-log')
export class AuditController {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  @Allow('owner')
  @Get()
  @Returns(pageOf(auditEntrySchema))
  list(
    @Auth() auth: AuthContext,
    @Query({ schema: auditQuerySchema }) q: { entity?: string; entityId?: string; cursor?: string; limit: number },
  ) {
    return this.audit.list(auth.businessId, q);
  }
}
