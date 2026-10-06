import { z } from 'zod';

export const serviceSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    durationMin: z.number().int(),
    bufferBeforeMin: z.number().int(),
    bufferAfterMin: z.number().int(),
    /** Display only (no payments in v1), integer pence. */
    pricePence: z.number().int(),
    active: z.boolean(),
    staffIds: z.array(z.uuid()),
  })
  .meta({ id: 'Service' });
export type Service = z.infer<typeof serviceSchema>;

export const createServiceBodySchema = z.object({
  name: z.string().trim().min(1).max(100),
  durationMin: z.number().int().min(5).max(1440),
  bufferBeforeMin: z.number().int().min(0).max(240).default(0),
  bufferAfterMin: z.number().int().min(0).max(240).default(0),
  pricePence: z.number().int().min(0).max(10_000_000).default(0),
  active: z.boolean().default(true),
});
export type CreateServiceBody = z.infer<typeof createServiceBodySchema>;

export const updateServiceBodySchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    durationMin: z.number().int().min(5).max(1440),
    bufferBeforeMin: z.number().int().min(0).max(240),
    bufferAfterMin: z.number().int().min(0).max(240),
    pricePence: z.number().int().min(0).max(10_000_000),
    active: z.boolean(),
  })
  .partial();
export type UpdateServiceBody = z.infer<typeof updateServiceBodySchema>;

export const serviceListQuerySchema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  active: z.enum(['true', 'false']).optional(),
});
