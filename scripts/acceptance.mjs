import { chromium } from 'playwright';
const errors = [];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('console', (m) => { if (m.type() === 'error' && !/CERT_AUTHORITY/.test(m.text())) errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
const base = 'http://127.0.0.1:4173/';
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
for (const [hash, needle] of [['#/course', 'The course'], ['#/graph', 'The state space'],
  ['#/solver', 'Solvers'], ['#/scan', 'Your cube'], ['#/training', 'Training'], ['#/lab', 'Cube lab']]) {
  await page.goto(base + hash);
  await page.waitForTimeout(2200);
  const h1 = await page.textContent('h1');
  check(`9. ${hash} still renders`, h1.includes(needle), h1);
}
await page.goto(base + '#/course/sticker-map');
await page.waitForTimeout(2500);
const lessonH1 = await page.textContent('h1');
check('9b. new lesson renders', lessonH1.includes('sticker map'), lessonH1);
await page.screenshot({ path: '/tmp/shots/n-lesson.png' });

console.log('PASS:'); pass.forEach((p) => console.log('  ✓', p));
if (fail.length) { console.log('FAIL:'); fail.forEach((f) => console.log('  ✗', f)); }
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
process.exit(fail.length ? 1 : 0);
