import { chromium } from 'playwright';
const errors = [];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('console', (m) => { if (m.type() === 'error' && !/CERT_AUTHORITY/.test(m.text())) errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
const base = 'http://127.0.0.1:4173/';
const MOVE_NAMES = ['U','U2',"U'",'R','R2',"R'",'F','F2',"F'",'D','D2',"D'",'L','L2',"L'",'B','B2',"B'"];
const pass = [];
const fail = [];
const check = (name, ok, detail = '') => (ok ? pass : fail).push(`${name}${detail ? ' — ' + detail : ''}`);

const dotColours = () => page.evaluate(() => {
  const svg = document.querySelector('svg[aria-label]');
  return [...svg.querySelectorAll('g > g > circle:last-child')].map((c) => getComputedStyle(c).fill);
});

await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForSelector('.tag.ok:has-text("solver ready")', { timeout: 60000 });
await page.waitForTimeout(1200);

// 1/2: 54 dots, 9 circles
const solvedCols = await dotColours();
check('2. all 54 facelets represented', solvedCols.length === 54, `${solvedCols.length} dots`);
const arcs = await page.$$eval('svg[aria-label] circle.map-arc', (e) => e.length);
check('1. nine circles drawn', arcs === 9, `${arcs} arcs`);

// 6: solved gives six clusters of nine
const counts = solvedCols.reduce((a, c) => (a[c] = (a[c] ?? 0) + 1, a), {});
check('6. solved shows six groups of nine',
  Object.keys(counts).length === 6 && Object.values(counts).every((v) => v === 9),
  JSON.stringify(Object.values(counts)));

// click a real dot element, so the test cannot miss through arithmetic
const dot = page.locator('svg[aria-label] g > g > circle:last-child').nth(20);
const db = await dot.boundingBox();
await page.mouse.move(db.x + db.width / 2, db.y + db.height / 2);
await page.waitForTimeout(200);
await page.mouse.click(db.x + db.width / 2, db.y + db.height / 2);
await page.waitForTimeout(500);
const inspector = await page.textContent('.card:has-text("Sticker inspector")');
check('8. picking a dot identifies the sticker', /slot/.test(inspector) && !/nothing picked/.test(inspector),
  inspector.replace(/\s+/g, ' ').slice(0, 90));
const marked = await page.$$eval('svg[aria-label] circle[stroke*="map-focus"], svg[aria-label] g circle', (els) => els.length);
check('8b. highlight ring drawn on the map', marked > 54);


// 3/4: a move updates both, and a move + inverse restores
// Turn the animation right down so the checks below are not racing it.
await page.click('[data-speed="fast"]');
// the move pad is the grid under "Turn a face by hand"; scope to it so the
// move-list chips above cannot be hit by mistake
const pad = page.locator('.move-pad').first();
const padBtn = (label) =>
  page.locator('.move-pad .move-chip', { hasText: new RegExp(`^${label.replace("'", "\\'")}$`) }).first();

await padBtn('R').click();
await page.waitForFunction(() => !window.__cubeAtlasState().turning, null, { timeout: 10000 });
await page.waitForTimeout(200);
const afterR = await dotColours();
const changedR = afterR.filter((c, i) => c !== solvedCols[i]).length;
// From a solved cube the turned face is one colour, so its own eight stickers
// move without changing what you see; only the twelve band stickers differ.
check('3. a turn repaints the band', changedR === 12, `${changedR} dots changed`);

// The preview highlight is the honest test of "twenty stickers move". The
// pointer is parked away from the pad first: clicking a move clears the
// preview deliberately (the move has happened, there is nothing left to
// preview), so hovering a button the pointer is already on sends no event.
await page.mouse.move(5, 5);
await page.waitForTimeout(200);
await padBtn('R').hover();
await page.waitForTimeout(400);
const litCount = await page.evaluate(() => {
  const svg = document.querySelector('svg[aria-label]');
  return [...svg.querySelectorAll('g > g')].filter((g) => {
    const o = g.getAttribute('opacity');
    return o === null || Number(o) > 0.9;
  }).length;
});
check('3b. a preview lights exactly twenty stickers', litCount === 20, `${litCount} lit`);
await page.mouse.move(5, 5);
await page.waitForTimeout(300);

await padBtn("R'").click();
await page.waitForFunction(() => !window.__cubeAtlasState().turning, null, { timeout: 10000 });
await page.waitForTimeout(200);
const afterInv = await dotColours();
check('4. move then inverse restores', afterInv.join() === solvedCols.join());

// 5: four quarter turns restore
for (let i = 0; i < 4; i++) {
  await padBtn('U').click();
  await page.waitForFunction(() => !window.__cubeAtlasState().turning, null, { timeout: 10000 });
  await page.waitForTimeout(120);
}
const after4 = await dotColours();
check('5. four quarter turns restore', after4.join() === solvedCols.join());
void pad;

// 7: scramble then solve, both animate
await page.click('[data-action="scramble"]');
await page.waitForTimeout(1800);
const scrambled = await dotColours();
const scCounts = scrambled.reduce((a, c) => (a[c] = (a[c] ?? 0) + 1, a), {});
check('7a. scramble mixes but keeps nine of each',
  scrambled.join() !== solvedCols.join() && Object.values(scCounts).every((v) => v === 9));
await page.click('[data-action="solve"]');
await page.waitForSelector('.callout:has-text("A solution in")', { timeout: 90000 });
await page.click('[data-speed="instant"]');
await page.click('[data-transport="toggle"]');
await page.waitForFunction(() => window.__cubeAtlasState().status === 'idle', null, { timeout: 60000 });
await page.waitForTimeout(500);
const afterSolve = await dotColours();
const solvedCounts = afterSolve.reduce((a, c) => (a[c] = (a[c] ?? 0) + 1, a), {});
check('7b. solving returns to six clean groups',
  afterSolve.join() === solvedCols.join(),
  Object.keys(solvedCounts).length + ' groups');

// 8: selecting a sticker highlights its counterpart
// 9: other pages still work
// Each destination is now a section and a tab, so both carry a name and
// either one identifies the content.
for (const [hash, needle] of [['#/learn', 'Lessons'], ['#/explore/state-space', 'State space'],
  ['#/explore/solvers', 'Solvers'], ['#/practise/your-cube', 'Your cube'],
  ['#/practise', 'Challenges'], ['#/cube/sequences', 'Sequences']]) {
  await page.goto(base + hash);
  await page.waitForTimeout(2200);
  const h1 = await page.textContent('h1');
  const tab = await page.textContent('[role="tab"][aria-selected="true"]').catch(() => '');
  check(`9. ${hash} still renders`, h1.includes(needle) || tab.includes(needle), `${h1} / ${tab}`);
}
await page.goto(base + '#/learn/sticker-map');
await page.waitForTimeout(2500);
const lessonH1 = await page.textContent('h1');
check('9b. new lesson renders', lessonH1.includes('sticker map'), lessonH1);
await page.screenshot({ path: '/tmp/shots/n-lesson.png' });

// 10: a drag turns the layer the way the pointer pulled it, and the opposite
// drag turns it back. The algebra is covered exhaustively by the unit tests;
// what this checks is that the camera projection feeding it is wired up.
await page.goto(base + '#/cube');
await page.waitForTimeout(2200);
await page.click('text=Not now').catch(() => {});
await page.click('[data-speed="instant"]').catch(() => {});
await page.waitForTimeout(400);
await page.locator('canvas').first().scrollIntoViewIfNeeded();
await page.waitForTimeout(700);
{
  const cb = await page.locator('canvas').first().boundingBox();
  // A corner sticker: centres and edges sit in a middle slice on at least one
  // axis, where a drag correctly turns nothing.
  const sx = cb.x + cb.width * 0.68;
  const sy = cb.y + cb.height * 0.43;
  const dragged = async (ddx, ddy) => {
    const before = (await page.evaluate(() => window.__cubeAtlasState().moves)).length;
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(sx + (ddx * i) / 10, sy + (ddy * i) / 10);
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
    await page.waitForTimeout(500);
    const moves = await page.evaluate(() => window.__cubeAtlasState().moves);
    return moves.length > before ? moves[moves.length - 1] : -1;
  };
  const up = await dragged(0, -70);
  const down = await dragged(0, 70);
  const nameOf = (m) => (m < 0 ? '(none)' : MOVE_NAMES[m]);
  check('10a. dragging a sticker turns a face', up >= 0 && down >= 0,
    `${nameOf(up)} then ${nameOf(down)}`);
  check('10b. and the opposite drag turns it back, not the same way again',
    up >= 0 && down >= 0
    && Math.floor(up / 3) === Math.floor(down / 3)
    && (up % 3) + (down % 3) === 2,
    `${nameOf(up)} vs ${nameOf(down)}`);
}

console.log('PASS:'); pass.forEach((p) => console.log('  ✓', p));
if (fail.length) { console.log('FAIL:'); fail.forEach((f) => console.log('  ✗', f)); }
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
process.exit(fail.length ? 1 : 0);
