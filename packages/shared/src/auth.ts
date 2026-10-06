import { z } from 'zod';
import { emailSchema, passwordSchema, tokenSchema } from './common.js';

export const roleSchema = z.enum(['owner', 'staff']);
export type Role = z.infer<typeof roleSchema>;

export const registerBodySchema = z.object({
  businessName: z.string().trim().min(2).max(100),
  name: z.string().trim().min(1).max(100),
  email: emailSchema,
  password: passwordSchema,
});
export type RegisterBody = z.infer<typeof registerBodySchema>;

export const loginBodySchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});
export type LoginBody = z.infer<typeof loginBodySchema>;

export const tokenBodySchema = z.object({ token: tokenSchema });
export const forgotPasswordBodySchema = z.object({ email: emailSchema });
export const resetPasswordBodySchema = z.object({ token: tokenSchema, password: passwordSchema });
export const acceptInviteBodySchema = z.object({ token: tokenSchema, password: passwordSchema });

export const meSchema = z
  .object({
    user: z.object({
      id: z.uuid(),
      email: z.string(),
      role: roleSchema,
      emailVerified: z.boolean(),
      staffId: z.uuid().nullable(),
      name: z.string(),
    }),
    business: z.object({
      id: z.uuid(),
      name: z.string(),
      slug: z.string(),
      isDemo: z.boolean(),
      live: z.boolean(),
    }),
  })
  .meta({ id: 'Me' });
export type Me = z.infer<typeof meSchema>;
