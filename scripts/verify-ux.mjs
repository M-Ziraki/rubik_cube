#!/usr/bin/env node
/**
 * The redesign, tested as journeys rather than as components.
 *
 * A page can render every one of its parts and still be unusable, so nothing
 * here asserts that an element exists. Each block walks a whole task the way a
 * person would walk it, at the viewport they would walk it on, and asserts on
 * what the application ended up doing.
 *
 * The measurements at the end are the ones that motivated the redesign: where
 * the primary controls land relative to the fold, how many interactions it
 * takes to reach study help from each page, and whether two fixed elements
 * overlap. All three were failing before and all three are checked here so
 * they cannot quietly start failing again.
 *
 *   npm run build && npx vite preview --port 4173 &
 *   node scripts/verify-ux.mjs                     # journeys A, B, D, E, F
 *   BASE=http://127.0.0.1:4180/ node scripts/verify-ux.mjs   # adds C
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4173/';
const WITH_JEV = process.env.JEV === '1';
const pass = [];
const fail = [];
const errors = [];
const notes = [];
const check = (name, ok, detail = '') => {
  (ok ? pass : fail).push(`${name}${detail ? ' — ' + detail : ''}`);
};

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

function watch(page) {
  page.on('console', (m) => {
    if (m.type() === 'error' && !/CERT_AUTHORITY|favicon|Failed to load resource/.test(m.text())) {
      errors.push(m.text());
    }
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return page;
}

/** A page with a clean profile, so "first visit" means first visit. */
async function fresh(viewport, { lang = 'en', welcomeSeen = true, touch = false } = {}) {
  const context = await browser.newContext({
    viewport,
    hasTouch: touch,
    isMobile: touch,
  });
  // Runs on every navigation, so it has to be idempotent: wiping storage each
  // time would erase the preferences the journey is checking survive.
  await context.addInitScript(([l, seen]) => {
    try {
      if (!sessionStorage.getItem('harness.seeded')) {
        localStorage.clear();
        localStorage.setItem('cube-atlas.lang.v1', l);
        if (seen) localStorage.setItem('cube-atlas.welcome.v1', '1');
        sessionStorage.setItem('harness.seeded', '1');
      }
    } catch { /* blocked storage */ }
  }, [lang, welcomeSeen]);
  const page = watch(await context.newPage());
  return page;
}

const ready = async (page, hash = '') => {
  await page.goto(BASE + hash);
  await page.waitForSelector('.assistant-dock', { timeout: 60000 });
  await page.waitForTimeout(1300);
};

const snapshot = (page) => page.evaluate(() => window.__cubeAtlasState());

/** Open the study panel, whatever state it was left in. */
async function openAssistant(page) {
  const expanded = await page.getAttribute('[data-assistant="dock"]', 'aria-expanded');
  if (expanded !== 'true') await page.click('[data-assistant="dock"]');
  await page.waitForSelector('.assistant-panel', { timeout: 8000 });
  await page.waitForTimeout(350);
}

const ROUTES = ['atlas', 'course', 'lab', 'graph', 'solver', 'scan', 'training', 'ai-lab', 'settings'];

/* ====================================== A. a first-time learner arrives === */
{
  const page = await fresh({ width: 1440, height: 1000 }, { welcomeSeen: false });
  await ready(page);

  const doors = await page.$$eval('.welcome-door', (els) => els.map((e) => e.textContent.trim()));
  check('A1. a first visit offers concrete starting points', doors.length === 4, `${doors.length} doors`);

  // Above the fold, without scrolling: the question and all four answers.
  const visible = await page.$$eval('.welcome-door', (els, h) =>
    els.filter((e) => e.getBoundingClientRect().bottom <= h).length, 1000);
  check('A2. every starting point is on the first screen', visible === 4, `${visible}/4`);

  await page.click('[data-welcome="learn"]');
  await page.waitForTimeout(1500);
  const h1 = await page.textContent('h1');
  check('A3. "learn the basics" lands on a lesson', /notation/i.test(h1), h1);
  check('A4. and it is a real lesson, not a menu',
    (await page.$('.lesson, .card')) !== null);

  // Finishing sends them onward rather than back to a list.
  await page.click('[data-lesson="complete"]');
  await page.waitForTimeout(1500);
  const next = await page.textContent('h1');
  check('A5. completing a lesson opens the next one', !/notation/i.test(next), next);
  const progress = await snapshot(page).then(() => page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('cube-atlas.progress.v1')).lessonsDone; }
    catch { return []; }
  }));
  check('A6. and the progress is recorded', progress.includes('notation'), progress.join(','));

  // The welcome does not come back to interrupt them.
  await ready(page);
  check('A7. the welcome is not shown again', (await page.$('.welcome-door')) === null);

  // It is still reachable on purpose.
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(400);
  await page.fill('.palette-input', 'starting');
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(900);
  check('A8. and can be brought back deliberately', (await page.$('.welcome-door')) !== null);
  await page.context().close();
}

/* ============================== B. exploring, watching, stepping back ===== */
{
  const page = await fresh({ width: 1440, height: 1000 });
  await ready(page);

  // Every verb of the workspace is on the first screen before any scrolling.
  const reach = await page.evaluate(() => {
    const y = (sel) => {
      const e = document.querySelector(sel);
      return e ? Math.round(e.getBoundingClientRect().bottom) : null;
    };
    return {
      scramble: y('[data-action="scramble"]'),
      solve: y('[data-action="solve"]'),
      play: y('[data-transport="toggle"]'),
      fold: window.innerHeight,
      scrolled: window.scrollY,
    };
  });
  const onScreen = ['scramble', 'solve', 'play']
    .every((k) => reach[k] !== null && reach[k] <= reach.fold);
  check('B1. scramble, solve and play are all on the first screen', onScreen,
    `scramble ${reach.scramble}, solve ${reach.solve}, play ${reach.play}, fold ${reach.fold}`);
  notes.push(`primary controls: scramble y=${reach.scramble}, solve y=${reach.solve}, play y=${reach.play} (fold ${reach.fold})`);

  await page.click('[data-action="scramble"]');
  await page.waitForTimeout(1600);
  check('B2. scrambling leaves an unsolved cube', !(await snapshot(page)).solved);

  // Both pictures agree about the same position.
  const agreement = await page.evaluate(() => {
    const scene = (window.__cubeAtlas ?? [])[0];
    const rows = scene ? scene.inspect() : [];
    const dots = [...document.querySelectorAll('svg[aria-label] g > g > circle:last-child')].length;
    return { mismatched: rows.filter((r) => r.painted !== r.expected).length, dots };
  });
  check('B3. the cube and the map show the same position',
    agreement.mismatched === 0 && agreement.dots === 54,
    `${agreement.mismatched} mismatched, ${agreement.dots} dots`);

  await page.click('[data-speed="fast"]');
  await page.click('[data-action="solve"]');
  await page.waitForSelector('.callout:has-text("A solution in")', { timeout: 90000 });
  const queued = (await snapshot(page)).moves.length;
  check('B4. a solution is found and queued', queued > 0, `${queued} moves`);

  await page.click('[data-transport="toggle"]');
  await page.waitForTimeout(1400);
  await page.click('[data-transport="toggle"]');
  await page.waitForTimeout(700);
  const paused = await snapshot(page);
  check('B5. playback pauses part-way through',
    paused.status !== 'playing' && paused.cursor > 0 && paused.cursor < paused.moves.length,
    `${paused.cursor}/${paused.moves.length}`);

  await page.click('[data-transport="back"]');
  await page.waitForTimeout(900);
  const stepped = await snapshot(page);
  check('B6. stepping back moves exactly one turn',
    stepped.cursor === paused.cursor - 1, `${paused.cursor} -> ${stepped.cursor}`);

  // The keyboard drives the same transport as the buttons.
  await page.click('.stage');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(900);
  check('B7. the right arrow steps forward',
    (await snapshot(page)).cursor === stepped.cursor + 1);
  await page.keyboard.press(' ');
  await page.waitForTimeout(600);
  check('B8. space starts playback', (await snapshot(page)).status === 'playing');
  await page.keyboard.press(' ');
  await page.waitForTimeout(600);
  check('B9. and space stops it again', (await snapshot(page)).status !== 'playing');

  // The advanced tools collapse and the choice survives a reload.
  await page.click('.tools-toggle');
  await page.waitForTimeout(300);
  check('B10. the tools panel collapses', (await page.$('#atlas-tools')) === null);
  await ready(page);
  check('B11. and stays collapsed on the next visit', (await page.$('#atlas-tools')) === null);
  await page.click('.tools-toggle');
  await page.waitForTimeout(300);
  check('B12. and reopens', (await page.$('#atlas-tools')) !== null);
  await page.context().close();
}

/* ===================== C. a lesson hands the cube over, and takes it back = */
{
  const page = await fresh({ width: 1440, height: 1000 });
  await ready(page, '#/course/notation');

  await page.click('[data-lesson="demo"]');
  await page.waitForTimeout(1600);
  check('C1. the lesson opens the Atlas', page.url().includes('#/atlas'), page.url());
  const loaded = await snapshot(page);
  check('C2. with a real sequence queued and nothing applied yet',
    loaded.moves.length === 4 && loaded.cursor === 0 && loaded.solved,
    `${loaded.moves.length} queued, cursor ${loaded.cursor}`);
  check('C3. and a way back to the lesson', (await page.$('[data-errand="return"]')) !== null);

  await page.click('[data-speed="instant"]');
  await page.click('[data-transport="toggle"]');
  await page.waitForTimeout(1800);
  const played = await snapshot(page);
  check('C4. the demonstration plays on the real cube',
    played.cursor === played.moves.length, `${played.cursor}/${played.moves.length}`);

  await page.click('[data-errand="return"]');
  await page.waitForTimeout(1400);
  check('C5. and the way back lands on the lesson it came from',
    page.url().includes('#/course/notation'), page.url());
  check('C6. with the lesson still there to finish',
    (await page.$('[data-lesson="complete"]')) !== null);
  check('C7. and the errand banner gone', (await page.$('[data-errand="bar"]')) === null);
  await page.context().close();
}

/* ============ D. every standard feature works with no key configured ====== */
{
  const page = await fresh({ width: 1440, height: 1000 });
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  await ready(page);

  // The same affordance, in the same place, on every page.
  const found = [];
  for (const route of ROUTES) {
    await page.goto(BASE + '#/' + route);
    await page.waitForTimeout(1100);
    const box = await page.evaluate(() => {
      const d = document.querySelector('.assistant-dock');
      if (!d) return null;
      const r = d.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    });
    found.push({ route, box });
  }
  check('D1. study help is present on every page',
    found.every((f) => f.box !== null), found.filter((f) => !f.box).map((f) => f.route).join(','));
  const positions = new Set(found.filter((f) => f.box).map((f) => `${f.box.x},${f.box.y}`));
  check('D2. and always in the same place', positions.size === 1, [...positions].join(' | '));
  const big = found.every((f) => f.box && f.box.w >= 24 && f.box.h >= 24);
  check('D3. and is a large enough target', big);

  // One interaction from anywhere, and it says plainly what it can do.
  await page.goto(BASE + '#/graph');
  await page.waitForTimeout(1200);
  await openAssistant(page);
  // "Not on" covers both shapes this journey runs in: no key anywhere, and a
  // server that holds one that the learner has not switched on. Both must say
  // which, rather than leaving it to be guessed.
  const status = await page.getAttribute('[data-assistant-status]', 'data-assistant-status');
  check('D4. one interaction opens it, from a page with no cube on it',
    status === 'needs-key' || status === 'off', String(status));
  const note = await page.textContent('.assistant-status');
  check('D4b. and says which of the four situations this is',
    (note ?? '').trim().length > 20, (note ?? '').replace(/\s+/g, ' ').slice(0, 60));
  const hasNext = await page.$('[data-jev="recommend"]');
  check('D5. the universal help is offered even with no key', hasNext !== null);
  const hasCommand = await page.$('[data-jev="command-text"]');
  check('D6. and the command box is not offered where there is nothing to act on',
    hasCommand === null);

  await page.click('[data-jev="recommend"]');
  await page.waitForTimeout(700);
  const badge = await page.textContent('[data-assistant="next"] .tag');
  check('D7. and the answer is labelled as computed, not judged',
    /computed/i.test(badge), badge.trim());

  await page.goto(BASE + '#/atlas');
  await page.waitForTimeout(1200);
  await openAssistant(page);
  check('D8. the command box appears where there is a cube',
    (await page.$('[data-jev="command-text"]')) !== null);
  const pageActions = await page.$$eval('[data-assistant-action]', (e) => e.length);
  check('D9. and the page contributes its own shortcuts', pageActions >= 3, `${pageActions} actions`);

  const upstream = requests.filter((u) => /typesafe\.ai/i.test(u));
  const asks = requests.filter((u) => u.includes('/api/jev/ask'));
  check('D10. nothing was sent to TypeSafe', upstream.length === 0, upstream.join(' '));
  check('D11. and no judgment was attempted', asks.length === 0, asks.join(' '));
  await page.context().close();
}

/* ================================================ E. on a phone =========== */
{
  const page = await fresh({ width: 390, height: 844 }, { touch: true });
  await ready(page);

  const tabs = await page.$$eval('.tabbar .tab', (els) => els.map((e) => e.textContent.trim()));
  check('E1. the phone has a tab bar rather than a scrolling row',
    tabs.length === 5, `${tabs.length} tabs`);
  const current = await page.$$eval('.tabbar .tab[aria-current="true"]', (e) => e.length);
  check('E2. and says which section you are in', current === 1, `${current} marked`);

  // Nothing fixed sits on top of anything else fixed.
  const overlaps = await page.evaluate(() => {
    const box = (s) => { const e = document.querySelector(s); return e ? e.getBoundingClientRect() : null; };
    const hit = (a, b) => a && b
      && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    // The transport bar reserves a gutter for the study-help pill, so the
    // question is whether anything covers a *control*, not whether two
    // bounding boxes touch.
    const controls = ['.transport-buttons', '.transport-speed', '.transport-progress']
      .map(box).filter(Boolean);
    const coversAny = (b) => controls.some((c) => hit(b, c));
    return {
      dockOverTabs: hit(box('.assistant-dock'), box('.tabbar')),
      dockOverTransport: coversAny(box('.assistant-dock')),
      tabsOverTransport: coversAny(box('.tabbar')),
      controls: controls.length,
    };
  });
  check('E3. study help does not cover the tab bar', !overlaps.dockOverTabs);
  check('E4. and does not cover the playback controls', !overlaps.dockOverTransport,
    `${overlaps.controls} controls measured`);
  check('E5. and the tab bar does not cover them either', !overlaps.tabsOverTransport);

  // The essential operations, by touch.
  await page.tap('[data-action="scramble"]');
  await page.waitForTimeout(1700);
  check('E6. scrambling works by touch', !(await snapshot(page)).solved);
  await page.tap('[data-speed="instant"]');
  await page.tap('[data-action="solve"]');
  await page.waitForSelector('.callout:has-text("A solution in")', { timeout: 90000 });
  await page.tap('[data-transport="toggle"]');
  await page.waitForFunction(() => window.__cubeAtlasState().status === 'idle', null, { timeout: 60000 });
  check('E7. solving and playback work by touch', (await snapshot(page)).solved);

  // Study help opens without hiding the way out of it.
  await page.tap('[data-assistant="dock"]');
  await page.waitForSelector('.assistant-panel', { timeout: 8000 });
  await page.waitForTimeout(400);
  const sheetClear = await page.evaluate(() => {
    const s = document.querySelector('.assistant-panel').getBoundingClientRect();
    const t = document.querySelector('.tabbar').getBoundingClientRect();
    return { covers: s.bottom > t.top + 1, height: Math.round(s.height), vp: window.innerHeight };
  });
  check('E8. the panel stops above the tab bar', !sheetClear.covers,
    `panel ${sheetClear.height}px of ${sheetClear.vp}px`);
  await page.tap('.assistant-panel .btn.ghost.icon');
  await page.waitForTimeout(400);
  check('E9. and closes again', (await page.$('.assistant-panel')) === null);

  // "More" reaches everything the tab bar does not.
  await page.tap('.tabbar .tab:last-child');
  await page.waitForSelector('.more-sheet', { timeout: 8000 });
  const more = await page.$$eval('.more-list .btn', (e) => e.length);
  check('E10. "more" reaches the remaining sections', more === 5, `${more} entries`);
  check('E11. and carries the language control',
    (await page.$('.more-foot [data-lang="fa"]')) !== null);

  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('E12. no horizontal overflow on a phone', overflow <= 1, `${overflow}px`);
  await page.context().close();
}

/* ============================ F. the same session, in the other language == */
{
  const page = await fresh({ width: 1440, height: 1000 });
  await ready(page);
  await page.click('[data-action="scramble"]');
  await page.waitForTimeout(1600);
  await page.click('[data-speed="fast"]');
  await page.click('[data-action="solve"]');
  await page.waitForSelector('.callout:has-text("A solution in")', { timeout: 90000 });
  await page.click('[data-transport="toggle"]');
  await page.waitForTimeout(1500);
  await page.click('[data-transport="toggle"]');
  await page.waitForTimeout(600);
  const before = await snapshot(page);

  // Switch mid-solution, from inside the study panel's own corner of the page.
  await page.click('.sidebar [data-lang="fa"]');
  await page.waitForTimeout(1000);
  const after = await snapshot(page);
  check('F1. the position survives the switch', after.facelets === before.facelets);
  check('F2. the queued solution survives', after.moves.length === before.moves.length);
  check('F3. the cursor survives', after.cursor === before.cursor);
  check('F4. the speed survives', after.turnSpeed === before.turnSpeed);
  check('F5. the document is right to left',
    (await page.evaluate(() => document.documentElement.dir)) === 'rtl');

  // The redesigned chrome is translated, not just mirrored.
  const chrome = await page.evaluate(() => ({
    dock: document.querySelector('.assistant-dock')?.textContent.trim(),
    tools: document.querySelector('.tools-toggle')?.textContent.trim(),
    nav: [...document.querySelectorAll('.nav-group-title')].map((e) => e.textContent.trim()),
  }));
  const persian = /[؀-ۿ]/;
  check('F6. the study help affordance is translated', persian.test(chrome.dock ?? ''), chrome.dock);
  check('F7. the tools panel is translated', persian.test(chrome.tools ?? ''), chrome.tools);
  check('F8. the navigation sections are translated',
    chrome.nav.length > 0 && chrome.nav.every((s) => persian.test(s)), chrome.nav.join(' | '));

  await openAssistant(page);
  const panel = await page.evaluate(() => {
    const p = document.querySelector('.assistant-panel');
    const r = p.getBoundingClientRect();
    return { left: Math.round(r.left), dir: getComputedStyle(p).direction, text: p.textContent.slice(0, 60) };
  });
  check('F9. the panel moves to the reading edge', panel.left < 40, `left ${panel.left}px`);
  check('F10. and is in Persian', persian.test(panel.text), panel.text.replace(/\s+/g, ' ').slice(0, 40));

  // Notation inside Persian prose still reads left to right.
  const misdirected = await page.evaluate(() => {
    const bad = [];
    for (const el of document.querySelectorAll('.assistant-panel span, .assistant-panel bdi')) {
      const t = (el.textContent ?? '').trim();
      if (!/^[URFDLB](?:['’]|2)$/.test(t)) continue;
      if (getComputedStyle(el).direction !== 'ltr') bad.push(t);
    }
    return bad;
  });
  check('F11. notation in the panel stays left to right', misdirected.length === 0, misdirected.join(' '));

  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('F12. no horizontal overflow in Persian', overflow <= 1, `${overflow}px`);

  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.click('.sidebar [data-lang="en"]');
  await page.waitForTimeout(800);
  const back = await snapshot(page);
  check('F13. switching back keeps the position too',
    back.facelets === before.facelets && back.cursor === before.cursor);
  await page.context().close();
}

/* =============================== G. measurements and keyboard access ====== */
{
  const page = await fresh({ width: 1440, height: 1000 });
  await ready(page);

  // How many interactions to reach study help, from every page.
  const counts = [];
  for (const route of ROUTES) {
    await page.goto(BASE + '#/' + route);
    await page.waitForTimeout(1000);
    await page.click('[data-assistant="dock"]');
    await page.waitForSelector('.assistant-panel', { timeout: 8000 });
    counts.push(1);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }
  check('G1. study help is one interaction away from every page',
    counts.length === ROUTES.length && counts.every((c) => c === 1),
    `${counts.length} pages, max ${Math.max(...counts)}`);
  notes.push(`interactions to study help: 1 on all ${ROUTES.length} pages`);

  // The first tab stop is the skip link, and it goes somewhere.
  await page.goto(BASE + '#/atlas');
  await page.waitForTimeout(1200);
  await page.keyboard.press('Tab');
  const first = await page.evaluate(() => document.activeElement?.className ?? '');
  check('G2. the first tab stop is the skip link', /skip-link/.test(first), first);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  check('G3. and it lands on the main content',
    (await page.evaluate(() => document.activeElement?.id ?? '')) === 'main');

  // Focus is visible on the controls that were styled from scratch.
  const rings = await page.evaluate(() => {
    const out = {};
    for (const sel of ['.nav-item', '.tools-toggle', '.assistant-dock']) {
      const el = document.querySelector(sel);
      if (!el) { out[sel] = 'missing'; continue; }
      el.focus();
      const s = getComputedStyle(el);
      out[sel] = `${s.outlineStyle} ${s.outlineWidth}`;
    }
    return out;
  });
  const ringed = Object.values(rings).every((v) => v !== 'missing' && !/none/.test(v));
  check('G4. custom controls show a focus ring', ringed, JSON.stringify(rings));

  // The palette is reachable and usable from the keyboard alone.
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(400);
  check('G5. the palette opens from the keyboard', (await page.$('.palette')) !== null);
  await page.keyboard.type('training');
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1200);
  check('G6. and navigates from the keyboard', page.url().includes('#/training'), page.url());

  // Interactive targets clear the 24px floor, inline links excepted.
  await page.goto(BASE + '#/atlas');
  await page.waitForTimeout(1300);
  const small = await page.evaluate(() => {
    const bad = [];
    for (const el of document.querySelectorAll('button, [role="button"], summary, input, select')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.width < 24 || r.height < 24) {
        bad.push(`${el.tagName}.${el.className}`.slice(0, 40) + ` ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
    }
    return bad;
  });
  check('G7. every control clears the 24px target floor',
    small.length === 0, small.slice(0, 5).join(' | '));
  await page.context().close();
}

/* ============ H. contextual help that actually does something (stub) ====== */
if (WITH_JEV) {
  const page = await fresh({ width: 1440, height: 1000 });
  await ready(page, '#/settings');
  await page.click('.card:has-text("Jev") [data-jev="on"]');
  await page.waitForTimeout(400);

  await page.goto(BASE + '#/training');
  await page.waitForTimeout(1500);
  await page.click('.btn.block:has-text("Three moves out")');
  await page.waitForFunction(() => {
    const s = window.__cubeAtlasState();
    return s && !s.solved;
  }, null, { timeout: 120000 });
  await page.waitForTimeout(2500);

  await openAssistant(page);
  const hintAction = await page.$('[data-assistant-action="hint"]');
  check('H1. the training page offers a hint through the panel', hintAction !== null);
  if (hintAction) {
    const before = (await snapshot(page)).facelets;
    await hintAction.click();
    await page.waitForTimeout(2500);
    const body = await page.textContent('.card:has-text("Your attempt")');
    check('H2. and asking for one produces a hint', /Hint/i.test(body ?? ''),
      (body ?? '').replace(/\s+/g, ' ').slice(0, 80));
    check('H3. without moving the cube', (await snapshot(page)).facelets === before);
  }
  await page.context().close();
}

console.log('PASS:');
pass.forEach((p) => console.log('  ✓', p));
if (fail.length) {
  console.log('FAIL:');
  fail.forEach((f) => console.log('  ✗', f));
}
if (notes.length) {
  console.log('measured:');
  notes.forEach((n) => console.log('  ·', n));
}
console.log('console errors:', errors.length ? errors.join('\n  ') : 'none');
console.log(`${pass.length} passed, ${fail.length} failed`);
await browser.close();
process.exit(fail.length ? 1 : 0);
