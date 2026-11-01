// `pnpm --filter @slotwise/api seed`: (re)creates the demo business. Used by `pnpm run setup`.
import 'reflect-metadata';
import { loadConfig } from '../config.js';
import { PublicCache } from '../business/public-cache.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';
import { DEMO_EMAIL, DEMO_PASSWORD, reseedDemo } from './seed.js';

const config = loadConfig();
const prisma = new PrismaService(config);
const redis = new RedisService(config);
await reseedDemo(prisma, config.MANAGE_TOKEN_SECRET, new PublicCache(redis, prisma));
await prisma.$disconnect();
redis.client.disconnect();
console.log(`Demo business ready. Log in as ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
