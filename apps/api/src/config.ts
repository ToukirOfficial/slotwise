import { z } from 'zod';

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().default(8115),
  WEB_URL: z.url().default('http://localhost:8015'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default('redis://127.0.0.1:6379/0'),
  JWT_SECRET: z.string().min(32),
  /** AES-256-GCM key for webhook secrets: 32 bytes as 64 hex characters. */
  ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/i, 'ENCRYPTION_KEY must be 64 hex characters'),
  MANAGE_TOKEN_SECRET: z.string().min(32),
  SMTP_URL: z.string().optional().default(''),
  MAIL_FROM: z.string().default('Slotwise <no-reply@slotwise.example>'),
  /** Redis key/queue prefix, so tests never touch dev queues. */
  QUEUE_PREFIX: z.string().default('slotwise'),
  /** Tests only: lets webhook tests post to a local receiver. Never set in production. */
  WEBHOOK_ALLOW_PRIVATE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

export type AppConfig = z.infer<typeof configSchema>;

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): AppConfig => {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) {
    // Names only, never values: the env holds secrets.
    const keys = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Invalid environment: ${keys}`);
  }
  if (parsed.data.NODE_ENV === 'production' && parsed.data.WEBHOOK_ALLOW_PRIVATE) {
    throw new Error('WEBHOOK_ALLOW_PRIVATE must not be set in production');
  }
  return parsed.data;
};

export const APP_CONFIG = Symbol('APP_CONFIG');
