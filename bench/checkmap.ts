import { readFileSync } from 'node:fs';
import { diagnose, parseFaceletString } from '../src/cube/facelet';
import { CubieCube, MOVE_CUBES } from '../src/cube/cubie';
import { MOVE_NAMES } from '../src/cube/defs';
import { toFacelets, faceletString } from '../src/cube/facelet';

const data = JSON.parse(readFileSync(process.argv[2], 'utf8'));
data.candidates.forEach((c: any, idx: number) => {
  const results: string[] = [];
  const cubes: Record<string, CubieCube | null> = {};
  for (const [t, s] of Object.entries(c.strings as Record<string, string>)) {
    let ok = false;
    try {
      const d = diagnose(parseFaceletString(s));
      ok = d.ok;
      cubes[t] = d.ok ? d.cube! : null;
    } catch { cubes[t] = null; }
    results.push(`${t}:${ok ? 'VALID' : 'no'}`);
  }
  // how far apart are consecutive stable states?
  const keys = Object.keys(c.strings);
  const gaps: string[] = [];
  for (let i = 1; i < keys.length; i++) {
    const a = cubes[keys[i - 1]], b = cubes[keys[i]];
    if (!a || !b) { gaps.push('-'); continue; }
    const delta = a.inverse().multiply(b);
    let single = 'many';
    for (let m = 0; m < 18; m++) if (delta.equals(MOVE_CUBES[m])) single = MOVE_NAMES[m];
    gaps.push(single);
  }
  console.log(`#${idx} sign=${JSON.stringify(c.sign)}  ${results.join(' ')}  transitions: ${gaps.join(' ')}`);
});
