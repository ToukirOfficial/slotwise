// README screenshots from the live demo: `pnpm screenshots` (or BASE_URL=http://localhost:8015 pnpm screenshots).
// Logs in with the public demo login, captures six views at 1440x900 and writes docs/images/*.png (each < 300 KB).
// Read-only: it never creates, changes or cancels anything.
import { mkdir, stat } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = (process.env.BASE_URL ?? 'https://slotwise.toukirahmedrony.com').replace(/\/$/, '');
const OUT = new URL('../docs/images/', import.meta.url);
const MAX_BYTES = 300 * 1024;
const DEMO = { email: 'demo@slotwise.example', password: 'demo-physio-2026' };

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  colorScheme: 'light',
  reducedMotion: 'reduce', // the collision demo jumps straight to its result
  timezoneId: 'Europe/London',
  locale: 'en-GB',
});
const page = await context.newPage();
const shots = [];
const save = async (name, target = page) => {
  const path = new URL(`${name}.png`, OUT).pathname;
  await target.screenshot({ path, animations: 'disabled' });
  shots.push(path);
};

// 1. Landing hero, 2. the "100 requests, one slot" demo once it has finished.
await page.goto(`${BASE}/`);
const collision = page.locator('figure[aria-label^="Demo: 100"]');
await collision.getByText('1 booked').waitFor();
await save('hero');
await save('collision-demo', collision);

// 3. The public booking page, part-way through: service and day picked, choosing a time.
await page.goto(`${BASE}/b/demo-physio`);
const widget = page.locator('slotwise-booking');
await widget.locator('button.option').first().click();
await widget.getByRole('button', { name: 'Next' }).click();
await widget.locator('button.day:not([disabled])').first().click();
await widget.getByRole('group', { name: 'Times' }).waitFor();
await save('booking-page');

// Log in as the demo owner (the dashboard's own API call, with its Origin for the CSRF check).
const login = await context.request.post(`${BASE}/api/v1/auth/login`, { data: DEMO, headers: { Origin: BASE } });
if (!login.ok()) throw new Error(`demo login failed: ${login.status()}`);

// 4. The dashboard calendar, on the week with upcoming bookings.
await page.goto(`${BASE}/dashboard`);
// A booking card ("10:15–11:00 …"), not the sidebar's Bookings link.
await page.locator('a[href^="/bookings/"]').filter({ hasText: /\d{2}:\d{2}–\d{2}:\d{2}/ }).first().waitFor();
await save('dashboard');

// 5. A booking with a history: the seeded one that was moved (Booked → Moved).
const today = new Date().toISOString().slice(0, 10);
const list = await (await context.request.get(`${BASE}/api/v1/bookings?from=${today}&status=confirmed&limit=100`)).json();
let movedId;
for (const b of list.items) {
  const log = await (await context.request.get(`${BASE}/api/v1/audit-log?entity=booking&entityId=${b.id}&limit=50`)).json();
  if (log.items.some((e) => e.action === 'booking.rescheduled')) {
    movedId = b.id;
    break;
  }
}
if (!movedId) throw new Error('no booking with a reschedule in its history: re-run the demo seed');
await page.goto(`${BASE}/bookings/${movedId}`);
await page.getByText('Moved', { exact: false }).first().waitFor();
await save('booking-detail');

// 6. The OpenAPI docs.
await page.goto(`${BASE}/api/docs`);
await page.locator('.opblock').first().waitFor();
await save('api-docs');

await browser.close();

let tooBig = false;
for (const path of shots) {
  const { size } = await stat(path);
  const kb = (size / 1024).toFixed(0);
  if (size > MAX_BYTES) tooBig = true;
  console.log(`${size > MAX_BYTES ? '✗' : '✓'} ${path.split('/docs/')[1]}  ${kb} KB`);
}
if (tooBig) {
  console.error(`Some screenshots are over ${MAX_BYTES / 1024} KB.`);
  process.exit(1);
}
