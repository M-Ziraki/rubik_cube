import { describe, expect, it } from 'vitest';
import { CubieCube } from '../cube/cubie';
import { buildCoreTables } from './tables';
import { CROSS_EDGES, crossTableStats, flipTableStats, solveCross, solveEdgeOrientation, solveToG1 } from './stages';
import { randomMoveScramble, randomState, seededRng } from './scramble';
import { getFlip, getSlice, getTwist } from './coords';

buildCoreTables();

describe('sub-goal solvers', () => {
  it('orients every edge, in the fewest possible moves', () => {
    const rng = seededRng(11);
    const stats = flipTableStats();
    expect(stats.size).toBe(2048);
    expect(stats.diameter).toBe(7);
    for (let i = 0; i < 200; i++) {
      const cube = randomState(rng);
      const r = solveEdgeOrientation(cube);
      expect(r.moves.length).toBe(r.distance);
      const after = cube.clone().applyMoves(r.moves);
      expect(getFlip(after)).toBe(0);
      expect(r.distance).toBeLessThanOrEqual(7);
    }
  });

  it('builds the bottom cross, in the fewest possible moves', () => {
    const rng = seededRng(12);
    const stats = crossTableStats();
    expect(stats.size).toBe(11880 * 16);
    expect(stats.diameter).toBe(8);
    for (let i = 0; i < 200; i++) {
      const cube = randomState(rng);
      const r = solveCross(cube);
      expect(r.moves.length).toBe(r.distance);
      const after = cube.clone().applyMoves(r.moves);
      for (const e of CROSS_EDGES) {
        expect(after.ep[e]).toBe(e);
        expect(after.eo[e]).toBe(0);
      }
      expect(r.distance).toBeLessThanOrEqual(8);
    }
  });

  it('reaches G1 in at most twelve moves, and never fewer than possible', () => {
    const rng = seededRng(13);
    let worst = 0;
    for (let i = 0; i < 40; i++) {
      const cube = CubieCube.fromMoves(randomMoveScramble(25, rng));
      const r = solveToG1(cube);
      expect(r.distance).toBeGreaterThanOrEqual(0);
      const after = cube.clone().applyMoves(r.moves);
      expect(getTwist(after)).toBe(0);
      expect(getFlip(after)).toBe(0);
      expect(getSlice(after)).toBe(0);
      expect(r.moves.length).toBe(r.distance);
      worst = Math.max(worst, r.distance);
    }
    expect(worst).toBeLessThanOrEqual(12);
  }, 300000);

  it('does nothing when there is nothing to do', () => {
    const solved = CubieCube.identity();
    expect(solveEdgeOrientation(solved).moves).toEqual([]);
    expect(solveCross(solved).moves).toEqual([]);
    expect(solveToG1(solved).moves).toEqual([]);
  });
});
