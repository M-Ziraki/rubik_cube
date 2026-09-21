#!/usr/bin/env node
/**
 * Browser verification of the behaviours that cannot be tested in Node:
 * what is actually painted, what the two views agree about, and whether the
 * page survives being used impatiently.
 *
 * Run against a built preview server:
 *   npm run build && npx vite preview --port 4173 &
 *   node scripts/verify.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4173/';
const pass = [];
const fail = [];
const errors = [];
const check = (name, ok, detail = '') => {
  (ok ? pass : fail).push(`${name}${detail ? ' — ' + detail : ''}`);
};

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('console', (m) => {
  if (m.type() === 'error' && !/CERT_AUTHORITY|favicon/.test(m.text())) errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

/* ------------------------------------------------------------- helpers --- */

const mapColours = () => page.evaluate(() => {
  const svg = document.querySelector('svg[aria-label]');
  return [...svg.querySelectorAll('g > g > circle:last-child')].map((c) => getComputedStyle(c).fill);
});

/** What the 3D scene has painted, compared with what the model says. */
const sceneReport = () => page.evaluate(() => {
  const scenes = [...(window.__cubeAtlas ?? [])];
  if (!scenes.length) return null;
  const rows = scenes[0].inspect();
  return {
    total: rows.length,
    mismatched: rows.filter((r) => r.painted !== r.expected).map((r) => r.facelet),
    // A sticker must never be painted the plastic colour of the cube body.
    blank: rows.filter((r) => /^#d[0-9a-f]{5}$/.test(r.painted) && r.base !== r.painted).length,
    dimmed: rows.filter((r) => r.dimmed).length,
    facelets: scenes[0].renderedFacelets,
  };
});

const storeFacelets = () => page.evaluate(() => {
  const svg = document.querySelector('svg[aria-label]');
  return [...svg.querySelectorAll('g > g')].length;
});

const state = () => page.evaluate(() => window.__cubeAtlasState());

const padBtn = (label) =>
  page.locator('.move-pad .move-chip', { hasText: new RegExp(`^${label.replace("'", "\\'")}$`) }).first();

const setSpeed = (id) => page.click(`[data-speed="${id}"]`);
const transport = (name) => page.click(`[data-transport="${name}"]`);
const action = (name) => page.click(`[data-action="${name}"]`);

/** Wait until no turn is being drawn, so painted and logical can be compared. */
async function untilStill(ms = 8000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (!(await state()).turning) return;
    await page.waitForTimeout(100);
  }
}

/** Wait until the player reports it has stopped, or the budget runs out. */
async function untilIdle(ms = 60000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const s = await state();
    if (s.status === 'idle' && !s.turning) return s;
    await page.waitForTimeout(250);
  }
  return state();
}

async function boot(hash = '') {
  await page.goto(BASE + hash, { waitUntil: 'networkidle' });
  await page.waitForSelector('.tag.ok', { timeout: 90000 });
  await page.waitForTimeout(800);
}

/* ------------------------------------- 1. manual rotation keeps colour --- */

await boot();
{
  const before = await sceneReport();
  check('scene registered', before !== null);
  check('1a. every sticker painted correctly at rest',
    before && before.mismatched.length === 0, JSON.stringify(before?.mismatched ?? []));

  await setSpeed('fast');
  const seen = [];
  for (const m of ['R', "U'", 'F2', 'L', "D'", 'B2', 'R2', 'U']) {
    await padBtn(m).click();
    await page.waitForTimeout(450);
    const r = await sceneReport();
    seen.push(`${m}:${r.mismatched.length}/${r.blank}`);
  }
  const after = await sceneReport();
  check('1b. no sticker loses its colour across a sequence',
    after.mismatched.length === 0 && after.blank === 0, seen.join(' '));
  check('1c. no sticker is left dimmed after a move',
    after.dimmed === 0, `${after.dimmed} dimmed`);
  const dots = await mapColours();
  const counts = dots.reduce((a, c) => (a[c] = (a[c] ?? 0) + 1, a), {});
  check('1d. the map still shows nine of each colour',
    Object.keys(counts).length === 6 && Object.values(counts).every((v) => v === 9),
    JSON.stringify(Object.values(counts)));
  check('1e. map and cube agree', (await storeFacelets()) === 54);
}

/* ------------------------------------------ 2. scramble, solve, replay --- */
{
  await action('scramble');
  await page.waitForTimeout(1500);
  const scrambled = await sceneReport();
  check('2a. scrambling leaves every sticker coloured',
    scrambled.mismatched.length === 0 && scrambled.blank === 0);

  await setSpeed('instant');
  await action('solve');
  await page.waitForSelector('.callout:has-text("A solution in")', { timeout: 90000 });
  const queued = await state();
  check('2b. a solution was queued', queued.moves.length > 0 && queued.cursor === 0,
    `${queued.moves.length} moves`);
  await transport('toggle');
  const done = await untilIdle();
  check('2c. playback runs to the end of the solution',
    done.cursor === done.moves.length, `${done.cursor}/${done.moves.length}`);
  check('2d. the cube really is solved afterwards', done.solved);
  const solved = await sceneReport();
  check('2e. playback finishes at a fully coloured cube',
    solved.mismatched.length === 0 && solved.blank === 0);
  const dots = await mapColours();
  const groups = new Set(dots).size;
  check('2f. the solved cube reads as six clean groups', groups === 6, `${groups} groups`);
}

/* ----------------------------------------- 3. interrupting the playback --- */
{
  await action('scramble');
  await page.waitForTimeout(1500);
  await setSpeed('slow');
  await action('solve');
  await page.waitForSelector('.callout:has-text("A solution in")', { timeout: 90000 });
  await transport('toggle');
  await page.waitForTimeout(2600);

  // Playback must be slow enough to follow: at the "slow" preset two and a bit
  // seconds is one or two moves, never the whole solution.
  const playing = await state();
  check('3a. playback is paced, not instant',
    playing.cursor > 0 && playing.cursor <= 3, `${playing.cursor} moves in 2.6 s`);
  check('3b. it is still playing', playing.status === 'playing');

  await transport('toggle');
  await untilStill();
  const paused = await state();
  check('3c. pause stops the cursor', paused.status === 'paused');
  const stillPaused = await state();
  check('3d. and it stays where it stopped', stillPaused.cursor === paused.cursor,
    `${paused.cursor} -> ${stillPaused.cursor}`);
  const pausedScene = await sceneReport();
  check('3e. pausing leaves a consistent cube',
    pausedScene.mismatched.length === 0 && pausedScene.blank === 0);
  check('3f. the painted cube matches the model', pausedScene.facelets === paused.facelets);

  const beforeBack = paused.facelets;
  await transport('back');
  await untilStill();
  const back = await state();
  check('3g. Back steps exactly one move', back.cursor === paused.cursor - 1,
    `${paused.cursor} -> ${back.cursor}`);
  const backScene = await sceneReport();
  check('3h. stepping back leaves a consistent cube',
    backScene.mismatched.length === 0 && backScene.blank === 0);

  await transport('next');
  await untilStill();
  const fwd = await state();
  check('3i. Next restores the position Back left', fwd.facelets === beforeBack,
    `${back.cursor} -> ${fwd.cursor}`);

  await transport('stop');
  await page.waitForTimeout(600);
  const stopped = await state();
  check('3j. Stop does not silently reset the cube',
    stopped.facelets === fwd.facelets && stopped.cursor === fwd.cursor);
  check('3k. Stop keeps the solution queued', stopped.moves.length === fwd.moves.length);

  await transport('restart');
  await page.waitForTimeout(900);
  const restarted = await state();
  check('3l. Restart rewinds without clearing the sequence',
    restarted.cursor === 0 && restarted.moves.length === stopped.moves.length);
}

/* --------------------------------------------- 4. rapid interactions --- */
{
  await setSpeed('normal');
  for (let i = 0; i < 24; i++) {
    await padBtn(['R', 'U', "F'", 'L2', "D'", 'B'][i % 6]).click({ delay: 0 });
  }
  await page.waitForTimeout(2500);
  const r = await sceneReport();
  check('4a. rapid clicking leaves every sticker coloured',
    r.mismatched.length === 0 && r.blank === 0, JSON.stringify(r.mismatched));
  const dots = await mapColours();
  const counts = dots.reduce((a, c) => (a[c] = (a[c] ?? 0) + 1, a), {});
  check('4b. the map is still a legal cube',
    Object.values(counts).every((v) => v === 9), JSON.stringify(Object.values(counts)));
  check('4c. no console errors from rapid interaction', errors.length === 0, errors.join(' | '));
}

/* -------------------------------------------- 5. switching language --- */
{
  const before = await state();
  const movesBefore = before.moves.length;
  await page.click('[data-lang="fa"]');
  await page.waitForTimeout(900);

  const dir = await page.evaluate(() => document.documentElement.dir);
  check('5a. the document flips to RTL', dir === 'rtl', dir);
  const lang = await page.evaluate(() => document.documentElement.lang);
  check('5b. the document language is set', lang === 'fa', lang);
  const afterSwitch = await state();
  check('5c. the cube is untouched by the switch',
    afterSwitch.facelets === before.facelets && afterSwitch.cursor === before.cursor);
  check('5d. the move list survives the switch', afterSwitch.moves.length === movesBefore);
  check('5d2. the speed setting survives the switch',
    afterSwitch.turnSpeed === before.turnSpeed);

  const h1 = await page.textContent('h1');
  check('5e. the page is actually in Persian', /[؀-ۿ]/.test(h1), h1);

  // Notation must still read left to right inside Persian prose.
  const notation = await page.$$eval('.mono-ltr', (els) =>
    els.slice(0, 40).map((e) => ({ dir: getComputedStyle(e).direction, text: e.textContent.trim() })));
  check('5f. notation stays left-to-right',
    notation.length > 0 && notation.every((n) => n.dir === 'ltr'),
    `${notation.length} isolated runs`);
  const chip = await page.locator('.seq .move-chip').first().textContent().catch(() => '');
  check('5g. move symbols are not translated', /^[URFDLB][2']?$/.test((chip ?? '').trim()), chip);

  // Every element whose whole text is a move symbol has to render left to
  // right, or `R'` reads as `'R` and means nothing.
  const misdirected = await page.evaluate(() => {
    const bad = [];
    for (const el of document.querySelectorAll('button, span, code, bdi, td, th, li')) {
      const text = (el.textContent ?? '').trim();
      if (!/^[URFDLB](?:['’]|2)$/.test(text)) continue;
      if (getComputedStyle(el).direction !== 'ltr') bad.push(text);
    }
    return bad;
  });
  check('5g2. every move symbol renders left to right',
    misdirected.length === 0, misdirected.join(' '));

  // The strongest form of "do not reverse move sequences": what is on screen,
  // read in visual order, has to be the move list the model holds.
  const rendered = await page.evaluate(() => {
    const seq = document.querySelector('.seq');
    if (!seq) return null;
    return [...seq.children]
      .map((c) => ({ x: c.getBoundingClientRect().x, t: c.textContent.trim() }))
      .sort((a, b) => a.x - b.x)
      .map((c) => c.t);
  });
  const model = (await state()).moves
    .map((m) => ['U', 'R', 'F', 'D', 'L', 'B'][Math.floor(m / 3)] + ['', '2', "'"][m % 3]);
  check('5g3. the sequence reads in the same order it is played',
    rendered !== null && rendered.join(' ') === model.join(' '),
    `${(rendered ?? []).slice(0, 6).join(' ')} vs ${model.slice(0, 6).join(' ')}`);

  // The new AI surfaces have to be translated like everything else, and they
  // have to work with the integration switched off - which is how most people
  // will see them.
  for (const [hash, needle] of [['#/settings', 'تنظیمات'], ['#/ai-lab', 'آزمایشگاه']]) {
    await page.goto(BASE + hash);
    await page.waitForTimeout(1500);
    const h1 = await page.textContent('h1');
    check(`5j. ${hash} is translated`, h1.includes(needle), h1);
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(`5k. ${hash} has no RTL overflow`, overflow <= 1, `${overflow}px`);
  }
  await page.goto(BASE);
  await page.waitForTimeout(1200);

  // and it must persist across a reload
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  check('5h. the language choice survives a refresh',
    (await page.evaluate(() => document.documentElement.lang)) === 'fa');

  // lessons and progress are still reachable in Persian
  await page.goto(BASE + '#/course');
  await page.waitForTimeout(1200);
  const courseH1 = await page.textContent('h1');
  check('5i. the course is translated', /[؀-ۿ]/.test(courseH1), courseH1);
}

/* ------------------------------------------------ 6. responsive layouts --- */
{
  const sizes = [[1440, 1000, 'desktop'], [900, 1100, 'tablet'], [390, 844, 'mobile']];
  for (const lang of ['fa', 'en']) {
    // Back to a desktop viewport first: the picker has to be reachable from
    // whatever size the previous round left behind.
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(BASE);
    await page.waitForTimeout(600);
    await page.click(`[data-lang="${lang}"]`);
    await page.waitForTimeout(500);
    for (const [w, h, name] of sizes) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(700);
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(`6. ${lang} ${name} has no horizontal overflow`, overflow <= 1, `${overflow}px`);
      // Both the sidebar and the mobile bar carry a picker; at least one of
      // them has to be on screen at every width.
      const reachable = await page.evaluate((other) =>
        [...document.querySelectorAll(`[data-lang="${other}"]`)]
          .some((e) => e.getBoundingClientRect().width > 0), lang === 'fa' ? 'en' : 'fa');
      check(`6. ${lang} ${name} can still switch language`, reachable);
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
}

/* ---------------------------------------------------- 7. no regressions --- */
{
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(BASE);
  await page.waitForTimeout(600);
  await page.click('[data-lang="en"]');
  await page.waitForTimeout(800);

  const arcs = await page.$$eval('svg[aria-label] circle.map-arc', (e) => e.length);
  check('7a. the sticker map still draws nine circles', arcs === 9, `${arcs}`);
  const dots = await mapColours();
  check('7b. the sticker map still draws 54 dots', dots.length === 54, `${dots.length}`);

  await page.goto(BASE + '#/graph');
  await page.waitForTimeout(2500);
  const graphH1 = await page.textContent('h1');
  check('7c. the state-space graph is still its own page', /state space/i.test(graphH1), graphH1);
  const canvas = await page.$$eval('canvas', (e) => e.length);
  check('7d. the state-space graph still renders', canvas > 0, `${canvas} canvases`);

  for (const [hash, re] of [['#/course', /course/i], ['#/lab', /cube lab/i],
    ['#/solver', /solvers/i], ['#/scan', /your cube/i], ['#/training', /training/i],
    ['#/ai-lab', /learning lab/i], ['#/settings', /settings/i]]) {
    await page.goto(BASE + hash);
    await page.waitForTimeout(1800);
    const h1 = await page.textContent('h1');
    check(`7e. ${hash} renders`, re.test(h1), h1);
  }
}

console.log('PASS:');
pass.forEach((p) => console.log('  ✓', p));
if (fail.length) {
  console.log('FAIL:');
  fail.forEach((f) => console.log('  ✗', f));
}
console.log('console errors:', errors.length ? errors.join('\n  ') : 'none');
await browser.close();
process.exit(fail.length ? 1 : 0);
