import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2 });
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
await page.waitForSelector('.tag.ok:has-text("solver ready")', { timeout: 60000 });
await page.waitForTimeout(1500);
const el = await page.$('svg[aria-label]');
await el.screenshot({ path: '/tmp/shots/mine-map.png' });
await browser.close();
