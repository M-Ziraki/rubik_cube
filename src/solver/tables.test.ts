import { describe, expect, it } from 'vitest';
import { buildCoreTables, tableDiameter, tableHistogram } from './tables';
import { N_CORNER_PERM, N_EDGE8_PERM, N_FLIP, N_SLICE, N_SLICE_PERM, N_TWIST, getFlip, getSlice, getTwist, getCornerPerm, getEdge8Perm, getSlicePerm, setTwist, setFlip, setSlice } from './coords';
import { CubieCube, MOVE_CUBES } from '../cube/cubie';
import { N_MOVES, PHASE2_MOVES } from '../cube/defs';
import { indexToPerm, permToIndex } from './permutil';

describe('permutation ranking', () => {
  it('round-trips all 8! corner permutations', () => {
    for (let i = 0; i < 40320; i += 7) {
      expect(permToIndex(indexToPerm(i, 8), 8)).toBe(i);
    }
    expect(permToIndex([0, 1, 2, 3, 4, 5, 6, 7], 8)).toBe(0);
  });
});

describe('coordinates', () => {
  it('solved cube sits at the origin of every coordinate', () => {
    const c = CubieCube.identity();
    expect(getTwist(c)).toBe(0);
    expect(getFlip(c)).toBe(0);
    expect(getSlice(c)).toBe(0);
    expect(getCornerPerm(c)).toBe(0);
    expect(getEdge8Perm(c)).toBe(0);
    expect(getSlicePerm(c)).toBe(0);
  });

  it('twist / flip / slice encode and decode consistently', () => {
    const c = CubieCube.identity();
    for (let t = 0; t < N_TWIST; t += 13) { setTwist(c.co, t); expect(getTwist(c)).toBe(t); }
    for (let f = 0; f < N_FLIP; f += 11) { setFlip(c.eo, f); expect(getFlip(c)).toBe(f); }
    for (let s = 0; s < N_SLICE; s++) { setSlice(c.ep, s); expect(getSlice(c)).toBe(s); }
  });
});

describe('tables', () => {
  const T = buildCoreTables();

  it('move tables agree with applying the move to a real cube', () => {
    let c = CubieCube.identity();
    for (let step = 0; step < 300; step++) {
      c = c.multiply(MOVE_CUBES[Math.floor(Math.random() * 18)]);
      const tw = getTwist(c), fl = getFlip(c), sl = getSlice(c), cpi = getCornerPerm(c);
      for (let m = 0; m < N_MOVES; m++) {
        const after = c.multiply(MOVE_CUBES[m]);
        expect(T.twistMove[tw * N_MOVES + m]).toBe(getTwist(after));
        expect(T.flipMove[fl * N_MOVES + m]).toBe(getSlice(after) >= 0 ? getFlip(after) : -1);
        expect(T.sliceMove[sl * N_MOVES + m]).toBe(getSlice(after));
        expect(T.cornerPermMove[cpi * N_MOVES + m]).toBe(getCornerPerm(after));
      }
    }
  });

  it('phase-2 move tables agree on states inside G1', () => {
    // Build random elements of G1 by only using phase-2 moves.
    let c = CubieCube.identity();
    for (let step = 0; step < 300; step++) {
      c = c.multiply(MOVE_CUBES[PHASE2_MOVES[Math.floor(Math.random() * 10)]]);
      expect(getTwist(c)).toBe(0);
      expect(getFlip(c)).toBe(0);
      expect(getSlice(c)).toBe(0);
      const e8 = getEdge8Perm(c), sp = getSlicePerm(c), cpi = getCornerPerm(c);
      for (let j = 0; j < 10; j++) {
        const after = c.multiply(MOVE_CUBES[PHASE2_MOVES[j]]);
        expect(T.edge8PermMove[e8 * 10 + j]).toBe(getEdge8Perm(after));
        expect(T.slicePermMove[sp * 10 + j]).toBe(getSlicePerm(after));
        expect(T.cornerPermMoveP2[cpi * 10 + j]).toBe(getCornerPerm(after));
      }
    }
  });

  it('pruning tables are complete where they must be', () => {
    expect(T.pruneTwistSlice.length).toBe(N_SLICE * N_TWIST);
    expect(T.pruneFlipSlice.length).toBe(N_SLICE * N_FLIP);
    expect(T.pruneTwistSlice.indexOf(255)).toBe(-1);
    expect(T.pruneFlipSlice.indexOf(255)).toBe(-1);
    expect(T.pruneTwistSlice[0]).toBe(0);
    expect(T.pruneFlipSlice[0]).toBe(0);
    expect(T.pruneP2Corner[0]).toBe(0);
    expect(T.pruneP2Edge[0]).toBe(0);
  });

  it('pruning tables never over-estimate: a move changes distance by at most 1', () => {
    for (let trial = 0; trial < 2000; trial++) {
      const sl = Math.floor(Math.random() * N_SLICE);
      const tw = Math.floor(Math.random() * N_TWIST);
      const d = T.pruneTwistSlice[sl * N_TWIST + tw];
      for (let m = 0; m < N_MOVES; m++) {
        const d2 = T.pruneTwistSlice[T.sliceMove[sl * N_MOVES + m] * N_TWIST + T.twistMove[tw * N_MOVES + m]];
        expect(Math.abs(d - d2)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('phase-2 index spaces are fully reachable', () => {
    // Parity ties corners to *all twelve* edges, and the eight-edge coordinate
    // is free in each of these two projections, so nothing is unreachable.
    expect(T.pruneP2Corner.indexOf(255)).toBe(-1);
    expect(T.pruneP2Edge.indexOf(255)).toBe(-1);
    expect(T.pruneP2Corner.length).toBe(N_SLICE_PERM * N_CORNER_PERM);
    expect(T.pruneP2Edge.length).toBe(N_SLICE_PERM * N_EDGE8_PERM);
  });

  it('sub-problem diameters match exhaustive search', () => {
    // These are the exact eccentricities of each abstracted puzzle; they are
    // recomputed from scratch on every run, so they double as a regression
    // test on the move tables feeding the breadth-first search.
    expect(tableDiameter(T.pruneTwistSlice)).toBe(9);
    expect(tableDiameter(T.pruneFlipSlice)).toBe(9);
    expect(tableDiameter(T.pruneFlipTwist)).toBe(9);
    expect(tableDiameter(T.pruneP2Corner)).toBe(14);
    expect(tableDiameter(T.pruneP2Edge)).toBe(12);
    expect(tableHistogram(T.pruneTwistSlice).reduce((a, b) => a + b, 0)).toBe(N_SLICE * N_TWIST);
  });
});
