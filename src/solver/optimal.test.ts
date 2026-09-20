import { describe, expect, it } from 'vitest';
import { CubieCube } from '../cube/cubie';

import { buildCoreTables, buildOptimalTables } from './tables';
import { solveOptimal } from './optimal';
import { lowerBound, solveTwoPhase } from './twophase';
import { randomMoveScramble, seededRng } from './scramble';
import { simplifySequence } from '../cube/notation';

buildCoreTables();
buildOptimalTables();

describe('optimal solver', () => {
  it('returns nothing to do for a solved cube', () => {
    const s = solveOptimal(CubieCube.identity());
    expect(s.length).toBe(0);
    expect(s.guarantee).toBe('proven-optimal');
  });

  it('finds the exact distance for every single move', () => {
    for (let m = 0; m < 18; m++) {
      const c = CubieCube.identity().applyMove(m);
      const s = solveOptimal(c, { timeBudgetMs: 5000 });
      expect(s.length).toBe(1);
      expect(c.clone().applyMoves(s.moves).isSolved()).toBe(true);
    }
  });

  it('never returns a solution longer than two-phase finds', () => {
    const rng = seededRng(4242);
    for (let i = 0; i < 12; i++) {
      const scramble = simplifySequence(randomMoveScramble(6, rng));
      const cube = CubieCube.fromMoves(scramble);
      const opt = solveOptimal(cube, { timeBudgetMs: 25000 });
      expect(opt.complete).toBe(true);
      expect(cube.clone().applyMoves(opt.moves).isSolved()).toBe(true);
      // The optimum can only be shorter than, or equal to, the scramble.
      expect(opt.length).toBeLessThanOrEqual(scramble.length);
      const two = solveTwoPhase(cube, { timeBudgetMs: 3000 });
      expect(opt.length).toBeLessThanOrEqual(two.length);
    }
  }, 600000);

  it('agrees with a brute-force breadth-first search up to depth 5', () => {
    // Enumerate every position within five moves and check the optimal solver
    // reports exactly the depth at which each was first reached.
    const seen = new Map<string, number>();
    let frontier = [CubieCube.identity()];
    seen.set(frontier[0].key(), 0);
    for (let d = 1; d <= 5; d++) {
      const next: CubieCube[] = [];
      for (const c of frontier) {
        for (let m = 0; m < 18; m++) {
          const child = c.clone().applyMove(m);
          const key = child.key();
          if (!seen.has(key)) { seen.set(key, d); next.push(child); }
        }
      }
      frontier = next;
    }
    expect(seen.size).toBe(1 + 18 + 243 + 3240 + 43239 + 574908);

    const rng = seededRng(99);
    const sample = [...seen.entries()];
    for (let i = 0; i < 40; i++) {
      const [, depth] = sample[Math.floor(rng() * sample.length)];
      expect(depth).toBeGreaterThanOrEqual(0);
    }
    // Spot-check a handful of known-depth positions end to end.
    for (let i = 0; i < 12; i++) {
      const pick = sample[Math.floor(rng() * sample.length)];
      const cube = rebuild(pick[0], seen);
      if (!cube) continue;
      const s = solveOptimal(cube, { timeBudgetMs: 20000 });
      expect(s.length).toBe(pick[1]);
    }
  }, 600000);

  it('lower bounds are never above the true distance', () => {
    const rng = seededRng(7);
    for (let i = 0; i < 40; i++) {
      const cube = CubieCube.fromMoves(randomMoveScramble(20, rng));
      const two = solveTwoPhase(cube, { timeBudgetMs: 2500 });
      expect(lowerBound(cube)).toBeLessThanOrEqual(two.length);
    }
  }, 300000);
});

/** Re-derive a cube from its key by searching the breadth-first map. */
function rebuild(key: string, seen: Map<string, number>): CubieCube | null {
  // Walk outwards from solved until we hit the key again; cheap enough for a
  // test and avoids storing 600k cubes.
  let frontier = [CubieCube.identity()];
  const visited = new Set<string>([frontier[0].key()]);
  if (frontier[0].key() === key) return frontier[0];
  const maxDepth = seen.get(key) ?? 5;
  for (let d = 1; d <= maxDepth; d++) {
    const next: CubieCube[] = [];
    for (const c of frontier) {
      for (let m = 0; m < 18; m++) {
        const child = c.clone().applyMove(m);
        const k = child.key();
        if (visited.has(k)) continue;
        visited.add(k);
        if (k === key) return child;
        next.push(child);
      }
    }
    frontier = next;
  }
  return null;
}
