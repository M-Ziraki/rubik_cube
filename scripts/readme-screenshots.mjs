#!/usr/bin/env node
/**
 * The stills under the README's demo GIF, taken from the real production build.
 *
 *   npm run build && npm run preview      # in one terminal
 *   node scripts/readme-screenshots.mjs   # in another; writes docs/screenshots/
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4173/';
const DEST = process.env.DEST ?? 'docs/screenshots';
mkdirSync(DEST, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium',
});

/** One page, in one language and theme, cropped to the work (no sidebar). */
async function shot(name, hash, { lang = 'en', theme = 'light', prepare } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript(([l, th]) => {
    try {
      localStorage.setItem('cube-atlas.lang.v1', l);
      localStorage.setItem('cube-atlas.prefs.v1', JSON.stringify({ turnSpeed: 900, theme: th }));
    } catch { /* ignore */ }
  }, [lang, theme]);
  const page = await context.newPage();
  await page.goto(BASE + hash, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.$eval('.welcome [data-welcome="dismiss"], .welcome button:last-child', (b) => b.click())
    .catch(() => undefined);
  await page.getByText(/^(Not now|فعلاً نه|الان نه)$/).first().click({ timeout: 1500 }).catch(() => undefined);
  if (prepare) await prepare(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(600);
  const sidebar = await page.$eval('.sidebar', (s) => s.getBoundingClientRect().width).catch(() => 0);
  const rtl = lang === 'fa';
  await page.screenshot({
    path: `${DEST}/${name}.png`,
    clip: { x: rtl ? 0 : sidebar, y: 0, width: 1280 - sidebar, height: 800 },
  });
  await context.close();
  console.log('wrote', `${DEST}/${name}.png`);
}

await shot('state-space', '#/explore/state-space');
await shot('pocket', '#/explore/state-space', {
  prepare: async (page) => {
    await page.getByRole('button', { name: /2×2×2/ }).first().click();
    await page.waitForTimeout(4000);
  },
});
await shot('persian-dark', '#/cube', {
  lang: 'fa',
  theme: 'dark',
  // A position part-way through, so the picture is not a solved cube.
  prepare: async (page) => {
    await page.waitForSelector('.tag.ok', { timeout: 90000 });
    await page.$eval('[data-action="scramble"]', (b) => b.click());
    await page.waitForTimeout(1500);
  },
});

await browser.close();
