// GitHub social preview card: `node scripts/social-preview.mjs` → docs/images/social-preview.png (1280x640).
// Upload it in the repository's Settings → General → Social preview (GitHub has no API for this).
import { stat } from 'node:fs/promises';
import { chromium } from 'playwright';

const OUT = new URL('../docs/images/social-preview.png', import.meta.url).pathname;

const html = /* html */ `<!doctype html>
<html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=block" rel="stylesheet">
<style>
  :root { --graphite:#1b1f26; --graphite-2:#252a33; --line:#333a45; --text:#aab2bf; --blue:#2453e0; --blue-soft:#8fa9f7; }
  * { box-sizing:border-box; margin:0 }
  body { width:1280px; height:640px; background:var(--graphite); color:#fff; font-family:Geist, sans-serif;
    background-image:linear-gradient(to bottom, rgba(255,255,255,.05) 1px, transparent 1px),
                     linear-gradient(to right, rgba(255,255,255,.05) 1px, transparent 1px);
    background-size:100% 64px, 160px 100%; padding:72px 80px; display:grid; grid-template-columns:1fr 430px; gap:56px; align-items:center }
  .brand { display:flex; align-items:center; gap:14px; font-size:30px; font-weight:600; letter-spacing:-.02em }
  h1 { margin-top:40px; font-size:58px; line-height:1.04; font-weight:700; letter-spacing:-.035em }
  p.sub { margin-top:24px; font-size:24px; line-height:1.45; color:var(--text) }
  .stack { margin-top:40px; display:flex; gap:10px; flex-wrap:wrap }
  .stack span { font:500 17px 'Geist Mono', monospace; color:var(--text); border:1px solid var(--line); border-radius:6px; padding:6px 10px }
  .term { background:var(--graphite-2); border:1px solid var(--line); border-radius:12px; overflow:hidden; font-family:'Geist Mono', monospace }
  .term header { display:flex; justify-content:space-between; padding:16px 20px; border-bottom:1px solid var(--line); font:500 17px Geist, sans-serif }
  .term header span:last-child { color:var(--text); font-weight:400 }
  .rows { padding:16px 20px; display:grid; gap:9px; font-size:17px }
  .row { display:flex; justify-content:space-between; color:var(--text) }
  .row.win { color:#fff } .row.win b { color:var(--blue-soft); font-weight:500 }
  .result { border-top:1px solid var(--line); padding:16px 20px; font:17px Geist, sans-serif; color:var(--text) }
  .result strong { color:#fff }
  .slot { display:inline-block; background:var(--blue); color:#fff; border-radius:6px; padding:2px 8px; margin-right:8px }
</style></head>
<body>
  <div>
    <div class="brand">
      <svg viewBox="0 0 20 20" width="40" height="40" style="color:#fff">
        <rect x="0.75" y="0.75" width="18.5" height="18.5" rx="4.25" fill="none" stroke="currentColor" stroke-width="1.5"/>
        <path d="M7 1v18M13 1v18M1 7h18M1 13h18" stroke="currentColor" stroke-width="1" opacity="0.35"/>
        <rect x="7" y="7" width="6" height="6" rx="1" fill="#2453e0"/>
      </svg>
      Slotwise
    </div>
    <h1>Appointment booking that can’t double&#8209;book.</h1>
    <p class="sub">Open-source booking engine for UK businesses: REST API, embeddable widget, owner dashboard and worker.</p>
    <div class="stack"><span>NestJS</span><span>Next.js</span><span>PostgreSQL</span><span>Redis</span><span>MIT</span></div>
  </div>
  <div class="term">
    <header><span>POST /bookings · 10:30</span><span>100 at once</span></header>
    <div class="rows">
      <div class="row win"><span>req 037</span><b>201 CREATED</b></div>
      <div class="row"><span>req 100</span><span>409 SLOT_TAKEN</span></div>
      <div class="row"><span>req 099</span><span>409 SLOT_TAKEN</span></div>
      <div class="row"><span>req 098</span><span>409 SLOT_TAKEN</span></div>
      <div class="row"><span>req 097</span><span>409 SLOT_TAKEN</span></div>
      <div class="row"><span>…</span><span>…</span></div>
    </div>
    <div class="result"><span class="slot">10:30</span><strong>1 booked</strong>, 99 refused</div>
  </div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 640 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.waitForFunction('document.fonts.status === "loaded"');
await page.screenshot({ path: OUT });
await browser.close();
console.log(`✓ docs/images/social-preview.png  ${((await stat(OUT)).size / 1024).toFixed(0)} KB`);
