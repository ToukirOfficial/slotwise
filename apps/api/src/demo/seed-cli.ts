// `pnpm --filter @slotwise/api seed`: (re)creates the demo business. Used by `pnpm run setup`.
import 'reflect-metadata';
import { loadConfig } from '../config.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DEMO_EMAIL, DEMO_PASSWORD, seedDemo } from './seed.js';

const config = loadConfig();
const prisma = new PrismaService(config);
await seedDemo(prisma, config.MANAGE_TOKEN_SECRET);
await prisma.$disconnect();
console.log(`Demo business ready. Log in as ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
