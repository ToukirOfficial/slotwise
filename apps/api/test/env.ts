import { existsSync } from 'node:fs';

// Every test file: load the root .env (locally), then point everything at the test database and test queues.
if (existsSync('../../.env')) process.loadEnvFile('../../.env');
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.QUEUE_PREFIX = 'slotwise-test';
process.env.WEB_URL = 'http://localhost:8015';
