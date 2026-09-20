import { chromium } from 'playwright';
const errors = [];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
page.on('console', (m) => { if (m.type() === 'error' && !/CERT_AUTHORITY/.test(m.text())) errors.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
const base = 'http://127.0.0.1:4173/';

await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForSelector('.tag.ok:has-text("solver ready")', { timeout: 60000 });
await page.click('button:has-text("Scramble")');
await page.waitForTimeout(3500);
await page.screenshot({ path: '/tmp/shots/final-atlas.png' });

// lesson measure + dark mode
await page.goto(base + '#/course/ladder');
await page.waitForTimeout(3500);
await page.screenshot({ path: '/tmp/shots/final-lesson.png' });
await page.click('.sidebar button:has-text("Dark")');
await page.waitForTimeout(1200);
await page.screenshot({ path: '/tmp/shots/final-lesson-dark.png' });

await page.goto(base + '#/graph');
await page.waitForTimeout(2000);
await page.screenshot({ path: '/tmp/shots/final-graph-dark.png' });
await page.click('.sidebar button:has-text("Light")');
await page.waitForTimeout(800);

// scan guided solve narrative
await page.goto(base + '#/scan');
await page.waitForTimeout(1200);
await page.click('button:has-text("Fill with a random cube")');
await page.waitForTimeout(1200);
await page.click('button:has-text("Rebuild and solve")');
await page.waitForTimeout(14000);
const guided = await page.textContent('.card:has-text("Guided solve")');
console.log('scan:', guided.replace(/\s+/g, ' ').slice(-420));
await page.screenshot({ path: '/tmp/shots/final-scan.png' });

// step through a few moves and confirm the cube follows
for (let i = 0; i < 4; i++) { await page.click('button:has-text("Next move")'); await page.waitForTimeout(500); }
console.log('after 4 steps:', (await page.textContent('.callout h4')));
await page.screenshot({ path: '/tmp/shots/final-scan-stepped.png' });

// mobile
const m = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
m.on('pageerror', (e) => errors.push(`mobile pageerror: ${e.message}`));
await m.goto(base, { waitUntil: 'networkidle' });
await m.waitForTimeout(6000);
await m.screenshot({ path: '/tmp/shots/final-mobile.png' });
const overflow = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
console.log('mobile horizontal overflow px:', overflow);

console.log('--- errors ---');
console.log(errors.length ? errors.join('\n') : 'none');
await browser.close();
