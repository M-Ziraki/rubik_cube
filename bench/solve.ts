import { CubieCube } from '../src/cube/cubie';
import { parseSequence, formatSequence } from '../src/cube/notation';
import { buildCoreTables } from '../src/solver/tables';
import { solveTwoPhase } from '../src/solver/twophase';
import { randomState, seededRng } from '../src/solver/scramble';

const t0 = Date.now();
buildCoreTables();
console.log(`tables built in ${Date.now() - t0} ms`);

const budget = Number(process.argv[2] ?? 3000);
const n = Number(process.argv[3] ?? 40);

const superflip = CubieCube.fromMoves(parseSequence("R L U2 F U' D F2 R2 B2 L U2 F' B' U R2 D F2 U R2 U").moves);
let s = solveTwoPhase(superflip, { timeBudgetMs: 30000 });
console.log(`superflip -> ${s.length} moves in ${s.millis} ms (${(s.nodes/1e6).toFixed(1)}M nodes) ${formatSequence(s.moves)}`);

const rng = seededRng(20260920);
const lens: number[] = [];
const times: number[] = [];
let fails = 0;
for (let i = 0; i < n; i++) {
  const c = randomState(rng);
  const r = solveTwoPhase(c, { timeBudgetMs: budget, maxLength: 20 });
  if (r.length < 0 || !c.clone().applyMoves(r.moves).isSolved()) { fails++; continue; }
  lens.push(r.length); times.push(r.millis);
}
lens.sort((a, b) => a - b); times.sort((a, b) => a - b);
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
console.log(`random states: n=${n} fails=${fails}`);
console.log(`  length  mean ${mean(lens).toFixed(2)}  median ${lens[lens.length>>1]}  max ${lens[lens.length-1]}`);
console.log(`  millis  mean ${mean(times).toFixed(0)}  median ${times[times.length>>1]}  max ${times[times.length-1]}`);
const hist: Record<number, number> = {};
lens.forEach((l) => { hist[l] = (hist[l] ?? 0) + 1; });
console.log('  histogram', JSON.stringify(hist));
