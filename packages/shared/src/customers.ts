import { z } from 'zod';
import { instantSchema } from './common.js';

export const customerSchema = z
  .object({
    id: z.uuid(),
    name: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    erasedAt: instantSchema.nullable(),
    bookingCount: z.number().int(),
    lastBookingAt: instantSchema.nullable(),
  })
  .meta({ id: 'Customer' });
export type Customer = z.output<typeof customerSchema>;

export const customerListQuerySchema = z.object({
  q: z.string().trim().min(2).max(100).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
