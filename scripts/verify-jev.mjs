#!/usr/bin/env node
/**
 * Browser verification of the optional integration, in both of its modes.
 *
 * The first half is the one that matters most: with no key configured, does
 * the application still do everything it did before, and does it send nothing
 * to TypeSafe? Every request the page makes is recorded, so "nothing" is an
 * assertion rather than a claim.
 *
 * The second half runs the whole thing against a stub server, so the routing,
 * the confirmations, the fallbacks and the failure handling are exercised
 * end to end without a key and without a network call leaving the machine.
 *
 *   node scripts/verify-jev.mjs           # against `npm run preview`
 *   BASE=http://127.0.0.1:4180 node ...   # against the stub server
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4173/';
const MODE = process.env.JEV_MODE ?? 'nokey';
const pass = [];
const fail = [];
const errors = [];
const check = (name, ok, detail = '') => {
  (ok ? pass : fail).push(`${name}${detail ? ' — ' + detail : ''}`);
};

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('console', (m) => {
  if (m.type() === 'error' && !/CERT_AUTHORITY|favicon|Failed to load resource/.test(m.text())) {
    errors.push(m.text());
  }
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

/** Every request the page makes, so "no calls to TypeSafe" can be proved. */
const requests = [];
page.on('request', (r) => requests.push(r.url()));

const state = () => page.evaluate(() => window.__cubeAtlasState());

async function boot(hash = '') {
  await page.goto(BASE + hash, { waitUntil: 'networkidle' });
  await page.waitForSelector('.tag.ok', { timeout: 90000 });
  await page.waitForTimeout(700);
  await dismissWelcome();
}

/** The starting-points card is a first-visit affordance, not the subject here. */
async function dismissWelcome() {
  const seen = await page.$('[data-welcome="dismiss"]');
  if (seen) { await seen.click(); await page.waitForTimeout(200); }
}

/** The study panel, opened the way a learner opens it. */
async function openAssistant() {
  const expanded = await page.getAttribute('[data-assistant="dock"]', 'aria-expanded');
  if (expanded !== 'true') {
    await page.click('[data-assistant="dock"]');
    await page.waitForSelector('.assistant-panel', { timeout: 10000 });
    await page.waitForTimeout(350);
  }
}

/* ================================================== A. with no key at all === */

if (MODE === 'nokey') {
  await boot();

  // The application still works, exactly as before.
  {
    await page.click('[data-speed="fast"]');
    for (const m of ['R', "U'", 'F2']) {
      await page.click(`.move-pad .move-chip:text-is("${m}")`);
      await page.waitForTimeout(350);
    }
    const s = await state();
    check('A1. manual moves still work with no key', s.cursor === 3, `${s.cursor} moves`);

    await page.click('[data-action="scramble"]');
    await page.waitForTimeout(1500);
    check('A2. scrambling still works', !(await state()).solved);

    await page.click('[data-speed="instant"]');
    await page.click('[data-action="solve"]');
    await page.waitForSelector('.callout:has-text("A solution in")', { timeout: 90000 });
    await page.click('[data-transport="toggle"]');
    await page.waitForFunction(() => window.__cubeAtlasState().status === 'idle', null, { timeout: 60000 });
    check('A3. solving and playback still work', (await state()).solved);
  }

  // Every section is reachable, including the two new ones.
  for (const [hash, re] of [
    ['#/course', /course/i], ['#/lab', /cube lab/i], ['#/graph', /state space/i],
    ['#/solver', /solvers/i], ['#/scan', /your cube/i], ['#/training', /training/i],
    ['#/ai-lab', /learning lab/i], ['#/settings', /settings/i],
  ]) {
    await page.goto(BASE + hash);
    await page.waitForTimeout(1600);
    const h1 = await page.textContent('h1');
    check(`A4. ${hash} renders`, re.test(h1), h1);
  }

  // The AI-dependent controls show a configuration state rather than breaking.
  {
    await page.goto(BASE + '#/settings');
    await page.waitForTimeout(1200);
    const status = await page.textContent('.card:has-text("Jev") .tag');
    check('A5. settings reports "not configured"', /not configured/i.test(status), status.trim());

    const onDisabled = await page.isDisabled('[data-jev="on"]');
    check('A6. the switch cannot be turned on without a key', onDisabled);

    const testDisabled = await page.isDisabled('[data-jev="test"]');
    check('A7. the connection test is unavailable without a key', testDisabled);
  }

  // The deterministic tutor still recommends something - and now does so from
  // the panel, which is on every page rather than only on the course index.
  {
    await page.goto(BASE + '#/course');
    await page.waitForTimeout(1500);
    await dismissWelcome();
    await openAssistant();
    const state0 = await page.getAttribute('[data-assistant-status]', 'data-assistant-status');
    check('A8a. the panel says plainly that there is no key',
      state0 === 'needs-key', String(state0));
    await page.click('[data-jev="recommend"]');
    await page.waitForTimeout(600);
    const body = await page.textContent('[data-assistant="next"]');
    check('A8. the tutor recommends without AI', /Read:|Practise:|Explore:|Compare:/.test(body),
      body.replace(/\s+/g, ' ').slice(0, 80));
    const badge = await page.textContent('[data-assistant="next"] .tag');
    check('A9. and labels the recommendation as computed', /computed/i.test(badge), badge.trim());
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    const closed = await page.$('.assistant-panel');
    check('A9b. Escape closes the panel', closed === null);
  }

  // The concept check falls back to a self-check with the worked answer.
  {
    await page.goto(BASE + '#/course/notation');
    await page.waitForTimeout(2000);
    await page.fill('.card:has-text("Explain it in your own words") textarea', 'they cancel out');
    await page.click('.card:has-text("Explain it in your own words") button.primary');
    await page.waitForTimeout(600);
    const body = await page.textContent('.card:has-text("Explain it in your own words")');
    check('A10. the concept check shows the worked answer', /One good answer/i.test(body));
    check('A11. and the marking rubric', /A complete answer says/i.test(body));
  }

  // The command box routes on keywords.
  {
    await page.goto(BASE);
    await page.waitForTimeout(1500);
    await dismissWelcome();
    await openAssistant();
    await page.fill('[data-jev="command-text"]', 'open the state space graph');
    await page.click('[data-jev="command"]');
    await page.waitForTimeout(1200);
    check('A12. the keyword router navigates', page.url().includes('#/graph'), page.url());
  }

  // Nothing reached TypeSafe.
  {
    const upstream = requests.filter((u) => /typesafe\.ai/i.test(u));
    check('A13. no request was sent to TypeSafe', upstream.length === 0, upstream.join(' '));
    const asks = requests.filter((u) => u.includes('/api/jev/ask') || u.includes('/api/jev/test'));
    check('A14. no judgment was even attempted', asks.length === 0, asks.join(' '));
    const status = requests.filter((u) => u.includes('/api/jev/status'));
    check('A15. only the local status probe was made', status.length > 0, `${status.length} probes`);
  }

  check('A16. no console errors', errors.length === 0, errors.join(' | '));
}

/* =============================================== B. against a stub server === */

if (MODE === 'stub') {
  await boot('#/settings');

  {
    const status = await page.textContent('.card:has-text("Jev") .tag');
    check('B1. a server key is detected', !/not configured/i.test(status), status.trim());

    await page.click('[data-jev="on"]');
    await page.waitForTimeout(300);
    await page.click('[data-jev="test"]');
    await page.waitForSelector('.callout', { timeout: 20000 });
    const result = await page.textContent('.card:has-text("Jev AI integration") .callout');
    check('B2. the connection test succeeds', /Connected/i.test(result), result.replace(/\s+/g, ' ').slice(0, 70));
  }

  // A confident diagnosis routes to the matching explanation.
  {
    await page.goto(BASE + '#/course/notation');
    await page.waitForTimeout(2000);
    await page.fill('.card:has-text("Explain it in your own words") textarea',
      "R and R prime are the same move so it is like R2");
    await page.click('.card:has-text("Explain it in your own words") button.primary');
    await page.waitForSelector('.card:has-text("Explain it in your own words") .callout', { timeout: 20000 });
    const body = await page.textContent('.card:has-text("Explain it in your own words")');
    check('B3. the diagnosis is shown', /Inverse moves/i.test(body), body.replace(/\s+/g, ' ').slice(0, 90));
    check('B4. and labelled as an AI judgment', /AI judgment/i.test(body));
    check('B5. with a demonstration to run', /Watch it happen/i.test(body));

    // Disagreeing opens the full material.
    await page.click('button:has-text("I disagree")');
    await page.waitForTimeout(400);
    const after = await page.textContent('.card:has-text("Explain it in your own words")');
    check('B6. disagreeing opens the worked answer', /One good answer/i.test(after));
    check('B7. and lets the learner say what they meant', /what you actually meant/i.test(after));
  }

  // The tutor shows both recommendations.
  {
    await page.goto(BASE + '#/ai-lab');
    await page.waitForTimeout(1500);
    await page.click('[data-lab="compare"]');
    await page.waitForTimeout(1500);
    const body = await page.textContent('.card:has-text("judged two ways")');
    check('B8. the lab shows the rules and the model side by side',
      /The rules say/.test(body) && /Jev says/.test(body));
    // A fresh profile is eligible for exactly one activity, so the
    // distribution is one bar wide. The point is that it is drawn at all.
    const spread = await page.textContent('.card:has-text("judged two ways")');
    const bars = await page.$$eval('.card:has-text("judged two ways") .meter', (e) => e.length);
    check('B9. and the probability distribution', /probability was spread/i.test(spread) && bars >= 1,
      `${bars} bars`);
  }

  // A mutating command asks before acting.
  {
    await page.goto(BASE);
    await page.waitForTimeout(1500);
    await dismissWelcome();
    await openAssistant();
    const before = (await state()).facelets;
    await page.fill('[data-jev="command-text"]', 'do the thing');
    await page.click('[data-jev="command"]');
    await page.waitForTimeout(1500);
    const body = await page.textContent('[data-assistant="command"]');
    const asked = /Did you mean|did not match/i.test(body);
    const confirmButton = await page.$('[data-assistant="confirm"]');
    check('B10. an ambiguous command asks instead of acting',
      asked && confirmButton !== null, body.replace(/\s+/g, ' ').slice(0, 90));
    check('B11. and the cube is untouched', (await state()).facelets === before);
  }

  // The panel is the only place a learner can be told the difference between
  // a judgment and a calculation, so it has to say so wherever it is open.
  {
    const tone = await page.getAttribute('[data-assistant-status]', 'data-assistant-status');
    check('B12a. the panel reports Jev as on', tone === 'on', String(tone));
  }

  check('B12. no console errors', errors.length === 0, errors.join(' | '));
}

/* ============================================= C. against a failing server === */

if (MODE === 'failing') {
  await boot('#/settings');
  await page.click('.card:has-text("Jev") [data-jev="on"]').catch(() => undefined);
  await page.waitForTimeout(300);

  {
    await page.click('[data-jev="test"]');
    await page.waitForSelector('.callout.danger', { timeout: 20000 });
    const body = await page.textContent('.callout.danger');
    check('C1. a failed test is reported plainly', body.trim().length > 0, body.replace(/\s+/g, ' ').slice(0, 80));
  }

  {
    await page.goto(BASE + '#/course');
    await page.waitForTimeout(1500);
    await dismissWelcome();
    await openAssistant();
    await page.click('[data-jev="recommend"]');
    await page.waitForTimeout(2000);
    const body = await page.textContent('[data-assistant="next"]');
    check('C2. the tutor still recommends after a failure',
      /Read:|Practise:|Explore:|Compare:/.test(body), body.replace(/\s+/g, ' ').slice(0, 90));
    check('C3. and says the service failed', /error|rejected|reach|too long|Try again/i.test(body));
  }

  {
    await page.goto(BASE);
    await page.waitForTimeout(1500);
    await dismissWelcome();
    await openAssistant();
    const before = (await state()).facelets;
    await page.fill('[data-jev="command-text"]', 'scramble the cube');
    await page.click('[data-jev="command"]');
    await page.waitForTimeout(2500);
    check('C4. a failure never changes the cube on its own',
      (await state()).facelets === before);
    const body = await page.textContent('[data-assistant="command"]');
    check('C5. the keyword router takes over', /Keyword matching/i.test(body),
      body.replace(/\s+/g, ' ').slice(0, 80));
    check('C5b. and offers the action rather than performing it',
      /Did you mean/i.test(body), body.replace(/\s+/g, ' ').slice(0, 80));
  }

  check('C6. no console errors', errors.length === 0, errors.join(' | '));
}

console.log(`PASS (${MODE}):`);
pass.forEach((p) => console.log('  ✓', p));
if (fail.length) {
  console.log('FAIL:');
  fail.forEach((f) => console.log('  ✗', f));
}
console.log('console errors:', errors.length ? errors.join('\n  ') : 'none');
await browser.close();
process.exit(fail.length ? 1 : 0);
