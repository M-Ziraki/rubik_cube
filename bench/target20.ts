/**
 * How long does it take to reach a solution of at most twenty moves?
 *
 * Different question from bench/solve.ts, which spends its whole budget
 * hunting for something shorter. Here the search stops the moment it meets
 * God's number, which is the claim the application actually makes.
 */
import { buildCoreTables } from '../src/solver/tables';
import { solveTwoPhase } from '../src/solver/twophase';
import { randomState, seededRng } from '../src/solver/scramble';

buildCoreTables();
const rng = seededRng(20260920);
const lens: number[] = [];
const times: number[] = [];
let over = 0;
for (let i = 0; i < 30; i++) {
  const c = randomState(rng);
  const s = solveTwoPhase(c, { timeBudgetMs: 25000, maxLength: 20, goodEnough: 20 });
  if (!c.clone().applyMoves(s.moves).isSolved()) throw new Error('bad solution');
  if (s.length > 20) over++;
  lens.push(s.length);
  times.push(s.millis);
}
const sorted = [...times].sort((a, b) => a - b);
const mean = (a: number[]): number => a.reduce((x, y) => x + y, 0) / a.length;
console.log('lengths ', lens.join(' '));
console.log('over 20 ', over);
console.log('ms: mean', mean(times).toFixed(0), 'median', sorted[15], 'p90', sorted[27], 'max', sorted[29]);
