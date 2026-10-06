import { z } from 'zod';
import { emailSchema } from './common.js';

export const staffSchema = z
  .object({
    id: z.uuid(),
    displayName: z.string(),
    active: z.boolean(),
    /** Login email, if the staff member has (or was invited to) a login. */
    email: z.string().nullable(),
    hasLogin: z.boolean(),
    invitePending: z.boolean(),
    serviceIds: z.array(z.uuid()),
  })
  .meta({ id: 'Staff' });
export type Staff = z.infer<typeof staffSchema>;

export const createStaffBodySchema = z.object({
  displayName: z.string().trim().min(1).max(100),
});
export const updateStaffBodySchema = z
  .object({ displayName: z.string().trim().min(1).max(100), active: z.boolean() })
  .partial();
export const inviteStaffBodySchema = z.object({ email: emailSchema });
export const staffServicesBodySchema = z.object({ serviceIds: z.array(z.uuid()).max(200) });
