import { chromium } from 'playwright';
const errors = [];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('console', (m) => { if (m.type() === 'error' && !/CERT_AUTHORITY/.test(m.text())) errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
const base = 'http://127.0.0.1:4173/';

await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForSelector('.tag.ok:has-text("solver ready")', { timeout: 60000 });
await page.waitForTimeout(1500);

const dots = await page.$$eval('svg[aria-label] g circle[fill]:not([fill="none"])', (e) => e.length);
const arcs = await page.$$eval('svg[aria-label] circle[fill="none"]', (e) => e.length);
console.log('solved state: dots =', dots, ' arcs =', arcs);
await page.screenshot({ path: '/tmp/shots/m1-solved.png' });

// cluster check: read the fill of every dot and group by position
const clusters = await page.evaluate(() => {
  const svg = document.querySelector('svg[aria-label]');
  const cs = [...svg.querySelectorAll('g > g > circle:last-child')];
  const byColour = {};
  cs.forEach((c) => {
    const f = getComputedStyle(c).fill;
    byColour[f] = (byColour[f] ?? 0) + 1;
  });
  return byColour;
});
console.log('dots per colour when solved:', JSON.stringify(clusters));

await page.click('button:has-text("Scramble")');
await page.waitForTimeout(2500);
await page.screenshot({ path: '/tmp/shots/m2-scrambled.png' });
const scr = await page.evaluate(() => {
  const svg = document.querySelector('svg[aria-label]');
  const cs = [...svg.querySelectorAll('g > g > circle:last-child')];
  const byColour = {};
  cs.forEach((c) => { const f = getComputedStyle(c).fill; byColour[f] = (byColour[f] ?? 0) + 1; });
  return byColour;
});
console.log('dots per colour when scrambled:', JSON.stringify(scr));

// hover a move button to preview
await page.hover('.move-chip:has-text("R2")');
await page.waitForTimeout(600);
await page.screenshot({ path: '/tmp/shots/m3-preview.png' });

// step through a move and capture mid-animation
await page.click('button:has-text("Reset to solved")');
await page.waitForTimeout(800);
await page.evaluate(() => {
  const el = [...document.querySelectorAll('input[type=range]')][0];
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, '800');
  el.dispatchEvent(new Event('input', { bubbles: true }));
});
await page.waitForTimeout(400);
await page.click('.move-chip:has-text("R2")');
await page.waitForTimeout(380);
await page.screenshot({ path: '/tmp/shots/m4-midturn.png' });
await page.waitForTimeout(1200);
await page.screenshot({ path: '/tmp/shots/m5-afterturn.png' });

console.log('--- errors ---');
console.log(errors.length ? errors.join('\n') : 'none');
await browser.close();
