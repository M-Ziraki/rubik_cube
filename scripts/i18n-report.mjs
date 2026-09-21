#!/usr/bin/env node
/**
 * Finds user-visible English that has not been routed through the dictionary,
 * and reports how complete each language is.
 *
 * The heuristics are deliberately blunt - two or more words of prose in JSX
 * text, or in a prop that ends up on screen - because a false positive costs a
 * glance and a false negative ships an untranslated string.
 */
import fs from 'node:fs';
import path from 'node:path';

const SRC = 'src';
const TEXT_PROPS = /\b(title|label|note|placeholder|caption|sub|empty|subtitle|aria-label|alt)=(?:"([^"]{2,})"|'([^']{2,})'|\{`([^`]{2,})`\})/g;
// Two or more ASCII words between JSX tags.
const JSX_TEXT = />\s*([A-Z][A-Za-z][^<>{}\n]{6,})\s*</g;

const offenders = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) { walk(p); continue; }
    if (!/\.tsx$/.test(p)) continue;
    if (/i18n\//.test(p)) continue;
    const lines = fs.readFileSync(p, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
      for (const re of [TEXT_PROPS, JSX_TEXT]) {
        re.lastIndex = 0;
        for (let m = re.exec(line); m; m = re.exec(line)) {
          const text = (m[2] ?? m[3] ?? m[4] ?? m[1] ?? '').trim();
          if (!text || !/[a-z]\s+[a-z]/i.test(text)) continue;
          if (/^[A-Z0-9 ×·+\-/]+$/.test(text)) continue;
          offenders.push(`${p}:${i + 1}  ${text.slice(0, 70)}`);
        }
      }
    });
  }
}
walk(SRC);

const keys = (f) => [...fs.readFileSync(f, 'utf8').matchAll(/^\s*'([^']+)':/gm)].map((m) => m[1]);
const en = keys('src/i18n/en.ts');
for (const lang of ['fa']) {
  const have = new Set(keys(`src/i18n/${lang}.ts`));
  const missing = en.filter((k) => !have.has(k));
  console.log(`${lang}: ${en.length - missing.length}/${en.length} keys translated`);
  if (missing.length) console.log('  missing:', missing.slice(0, 40).join(', '));
}

if (offenders.length) {
  console.log(`\n${offenders.length} possible untranslated strings:`);
  for (const o of offenders) console.log('  ' + o);
  process.exit(1);
}
console.log('\nNo hardcoded user-visible English found.');
