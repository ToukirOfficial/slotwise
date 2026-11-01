// README demo GIF from the live site: `pnpm demo-gif` (needs ffmpeg on PATH, e.g. `sudo apt install ffmpeg`).
// Books a slot on /b/demo-physio, shows it on the dashboard calendar, runs the landing page's
// "100 requests, one slot" demo, then CANCELS the test booking (the cancelled row disappears at the
// nightly demo reseed). Output: docs/images/demo.gif (< 5 MB). Override the site with BASE_URL.
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const BASE = (process.env.BASE_URL ?? 'https://slotwise.toukirahmedrony.com').replace(/\/$/, '');
const OUT = new URL('../docs/images/demo.gif', import.meta.url).pathname;
const MAX_BYTES = 5 * 1024 * 1024;
const DEMO = { email: 'demo@slotwise.example', password: 'demo-physio-2026' };
// Fictional visitor: example.com and Ofcom's drama phone range.
const VISITOR = { name: 'Jo Visitor', email: 'jo.visitor@example.com', phone: '07700 900123' };
const SIZE = { width: 1280, height: 800 };

execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); // fail early if ffmpeg is missing
await mkdir(new URL('.', `file://${OUT}`), { recursive: true });
const videoDir = await mkdtemp(join(tmpdir(), 'slotwise-gif-'));
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: SIZE,
  recordVideo: { dir: videoDir, size: SIZE },
  timezoneId: 'Europe/London',
  locale: 'en-GB',
  colorScheme: 'light',
});
// Logged in up front, so the dashboard opens straight away later in the recording.
const login = await context.request.post(`${BASE}/api/v1/auth/login`, { data: DEMO, headers: { Origin: BASE } });
if (!login.ok()) throw new Error(`demo login failed: ${login.status()}`);

const page = await context.newPage();
let bookingId;
try {
  // 1. A customer books on the public booking page.
  await page.goto(`${BASE}/b/demo-physio`);
  const widget = page.locator('slotwise-booking');
  await widget.locator('button.option').first().waitFor();
  await pause(1500);
  await widget.locator('button.option').first().click();
  await pause(1000);
  await widget.getByRole('button', { name: 'Next' }).click();
  await pause(1400);
  await widget.locator('button.day:not([disabled])').first().click();
  const times = widget.getByRole('group', { name: 'Times' }).locator('button');
  await times.first().waitFor();
  await pause(1400);
  await times.nth(Math.min(3, (await times.count()) - 1)).click();
  await pause(600);
  await widget.locator('#name').pressSequentially(VISITOR.name, { delay: 70 });
  await widget.locator('#email').pressSequentially(VISITOR.email, { delay: 45 });
  await widget.locator('#phone').pressSequentially(VISITOR.phone, { delay: 45 });
  await pause(900);
  const booked = page.waitForResponse((r) => r.url().includes('/api/v1/public/') && r.request().method() === 'POST');
  await widget.getByRole('button', { name: 'Book' }).click();
  const res = await booked;
  if (res.status() !== 201) throw new Error(`booking failed: ${res.status()}`);
  bookingId = (await res.json()).id;
  await widget.getByText('We’ve emailed you a confirmation').waitFor();
  await pause(3200);

  // 2. It's on the owner's calendar.
  await page.goto(`${BASE}/dashboard`);
  const card = page.locator('a[href^="/bookings/"]').filter({ hasText: VISITOR.name });
  await card.waitFor();
  await card.scrollIntoViewIfNeeded();
  await pause(700);
  await card.hover();
  await pause(4000);

  // 3. 100 requests for one slot: one booking, 99 refused.
  await page.goto(`${BASE}/`);
  const demo = page.locator('figure[aria-label^="Demo: 100"]');
  await demo.getByText('1 booked').waitFor({ timeout: 15_000 });
  await pause(1800);
  await demo.getByRole('button', { name: 'Run again' }).click();
  await demo.getByText('1 booked').waitFor({ timeout: 15_000 });
  await pause(3500);
} finally {
  // Never leave the test booking in the demo.
  if (bookingId) {
    const cancel = await context.request.post(`${BASE}/api/v1/bookings/${bookingId}/cancel`, {
      data: { reason: 'README demo recording' },
      headers: { Origin: BASE },
    });
    console.log(`test booking ${bookingId}: ${cancel.ok() ? 'cancelled' : `cancel FAILED (${cancel.status()})`}`);
  }
  await context.close(); // flushes the video
  await browser.close();
}

const [webm] = (await readdir(videoDir)).filter((f) => f.endsWith('.webm'));
const filter = 'fps=10,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle';
// Skip the first half second (blank page before the first paint).
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '0.5', '-i', join(videoDir, webm), '-vf', filter, '-loop', '0', OUT]);
await rm(videoDir, { recursive: true, force: true });

const seconds = Number(
  execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', OUT]).toString().trim(),
);
const { size } = await stat(OUT);
console.log(`${size > MAX_BYTES ? '✗' : '✓'} docs/images/demo.gif  ${(size / 1024 / 1024).toFixed(1)} MB, ${seconds.toFixed(1)} s`);
if (size > MAX_BYTES) process.exit(1);
