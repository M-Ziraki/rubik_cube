#!/usr/bin/env node
/**
 * Record the README's demo: scramble the cube, then solve it and play the
 * solution back, with the sticker map repainting beside it.
 *
 * It drives the real production build - nothing is staged or mocked - and
 * writes a WebM plus the timestamps needed to trim it, which
 * `scripts/make-demo-gif.sh` turns into docs/demo.gif.
 *
 *   npm run build && npm run preview      # in one terminal
 *   node scripts/record-demo.mjs          # in another
 */
import { chromium } from 'playwright';
import { mkdirSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4173/';
const OUT = process.env.OUT ?? 'demo-out';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium',
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 760 },
  deviceScaleFactor: 1,
  recordVideo: { dir: OUT, size: { width: 1280, height: 760 } },
});
const page = await context.newPage();

/*
 * Click through the DOM rather than the mouse. A mouse click scrolls its
 * target into view first, and the speed control also appears further down
 * the page, so the recording would lurch to the bottom and back.
 */
const press = (selector) => page.$eval(selector, (el) => el.click());
const t0 = Date.now();
const mark = () => (Date.now() - t0) / 1000;

await page.goto(BASE + '#/cube', { waitUntil: 'networkidle' });
await page.waitForSelector('.tag.ok:has-text("solver ready")', { timeout: 90000 });
await page.click('text=Not now').catch(() => {});
await press('[data-speed="fast"]');
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(900);

const idle = () => page.waitForFunction(() => {
  const s = window.__cubeAtlasState();
  return !s.turning && s.status === 'idle';
}, null, { timeout: 90000, polling: 50 });

const start = mark();
await page.waitForTimeout(800);                       // a moment on the solved cube

await press('[data-action="scramble"]');
await idle();
await page.waitForTimeout(700);                       // let the scramble be seen

await press('[data-speed="brisk"]');
// Solving queues the solution; Play walks it, one visible turn at a time.
await press('[data-action="solve"]');
await page.waitForSelector('.callout:has-text("A solution in")', { timeout: 90000 });
await page.waitForTimeout(400);
await press('[data-transport="toggle"]');
await page.waitForFunction(() => window.__cubeAtlasState().solved, null, { timeout: 120000, polling: 50 });
await idle();
await page.waitForTimeout(1800);                      // and the solved cube again
const end = mark();

const moves = await page.evaluate(() => window.__cubeAtlasState().moves.length);
await context.close();
await browser.close();

const video = readdirSync(OUT).find((f) => f.endsWith('.webm'));
renameSync(join(OUT, video), join(OUT, 'demo.webm'));
writeFileSync(join(OUT, 'demo.json'), JSON.stringify({ start, end, moves }, null, 2));
console.log(JSON.stringify({ start, end, duration: +(end - start).toFixed(2), moves }));
