#!/usr/bin/env node
// `pnpm run setup`: takes a fresh clone to a running app.
// Needs PostgreSQL 18 and Redis running locally. Uses only Node built-ins so it runs before `pnpm install`.
import { execFileSync, execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, userInfo } from 'node:os';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const run = (cmd, env = {}) => execSync(cmd, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } });
const step = (msg) => console.log(`\n▸ ${msg}`);

/** Local PostgreSQL credentials: ~/.pgpass if present, otherwise the OS user with no password. */
function localDbUser() {
  const pgpass = join(homedir(), '.pgpass');
  if (existsSync(pgpass)) {
    for (const line of readFileSync(pgpass, 'utf8').split('\n')) {
      const [host, port, , user, password] = line.split(':');
      if ((host === 'localhost' || host === '127.0.0.1' || host === '*') && (port === '5432' || port === '*') && user) {
        return { user, password: password ?? '' };
      }
    }
  }
  return { user: userInfo().username, password: '' };
}

function writeEnv() {
  const envPath = join(root, '.env');
  if (existsSync(envPath)) return console.log('  .env already exists, leaving it alone');
  const { user, password } = localDbUser();
  const auth = password ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}` : encodeURIComponent(user);
  const secret = () => randomBytes(32).toString('base64url');
  const values = {
    DATABASE_URL: `postgresql://${auth}@localhost:5432/slotwise_dev`,
    TEST_DATABASE_URL: `postgresql://${auth}@localhost:5432/slotwise_test`,
    JWT_SECRET: secret(),
    ENCRYPTION_KEY: randomBytes(32).toString('hex'),
    MANAGE_TOKEN_SECRET: secret(),
  };
  const text = readFileSync(join(root, '.env.example'), 'utf8')
    .split('\n')
    .map((line) => {
      const key = line.split('=')[0];
      return key && key in values ? `${key}=${values[key]}` : line;
    })
    .join('\n');
  writeFileSync(envPath, text, { mode: 0o600 });
  console.log('  wrote .env with fresh local secrets');
}

function loadEnv() {
  process.loadEnvFile(join(root, '.env'));
}

function createDatabase(url) {
  const u = new URL(url);
  const name = u.pathname.slice(1);
  const admin = new URL(url);
  admin.pathname = '/postgres';
  const exists = execFileSync('psql', [admin.toString(), '-Atc', `SELECT 1 FROM pg_database WHERE datname = '${name}'`])
    .toString()
    .trim();
  if (exists !== '1') {
    execFileSync('psql', [admin.toString(), '-qc', `CREATE DATABASE "${name}"`]);
    console.log(`  created ${name}`);
  }
  execFileSync('psql', [url, '-qc', 'CREATE EXTENSION IF NOT EXISTS btree_gist']);
}

step('Writing .env');
writeEnv();
loadEnv();

step('Installing dependencies');
run('pnpm install');

step('Creating databases (slotwise_dev, slotwise_test) with btree_gist');
createDatabase(process.env.DATABASE_URL);
createDatabase(process.env.TEST_DATABASE_URL);

step('Running migrations');
run('pnpm --filter @slotwise/api exec prisma migrate deploy');
run('pnpm --filter @slotwise/api exec prisma migrate deploy', { DATABASE_URL: process.env.TEST_DATABASE_URL });

step('Building');
run('pnpm build');

step('Seeding the demo business');
run('pnpm --filter @slotwise/api seed');

console.log(`\nDone. Start everything with: pnpm dev\nThen open ${process.env.WEB_URL ?? 'http://localhost:8015'}\n`);
