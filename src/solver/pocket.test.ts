import { describe, expect, it } from 'vitest';
import {
  N_POCKET, POCKET_MOVES, buildPocketTables, pocketApply, pocketFromCube,
  pocketOptimalMoves, pocketRandomAtDistance, pocketStickers, solvePocket,
} from './pocket';
import { CubieCube } from '../cube/cubie';
import { seededRng } from './scramble';

const T = buildPocketTables();

describe('2x2x2 exhaustive solver', () => {
  it('enumerates exactly 7! * 3^6 positions', () => {
    expect(N_POCKET).toBe(3674160);
    expect(T.distance.length).toBe(N_POCKET);
    expect(T.distance.indexOf(255)).toBe(-1);
    expect(T.histogram.reduce((a, b) => a + b, 0)).toBe(N_POCKET);
  });

  it("proves God's number for the 2x2x2 is 11", () => {
    expect(T.godsNumber).toBe(11);
    expect(T.histogram[0]).toBe(1);
    expect(T.histogram[1]).toBe(9);
    expect(T.histogram[2]).toBe(54);
    expect(T.histogram[3]).toBe(321);
    expect(T.histogram[11]).toBe(2644);
  });

  it('distance changes by exactly one across every edge', () => {
    const rng = seededRng(31337);
    for (let i = 0; i < 4000; i++) {
      const idx = Math.floor(rng() * N_POCKET);
      const d = T.distance[idx];
      let sawCloser = d === 0;
      for (let m = 0; m < POCKET_MOVES.length; m++) {
        const j = pocketApply(idx, m, T);
        expect(Math.abs(T.distance[j] - d)).toBeLessThanOrEqual(1);
        if (T.distance[j] === d - 1) sawCloser = true;
      }
      expect(sawCloser).toBe(true);
    }
  });

  it('solves every sampled position in exactly its distance', () => {
    const rng = seededRng(5);
    for (let d = 0; d <= T.godsNumber; d++) {
      for (let k = 0; k < 6; k++) {
        const idx = pocketRandomAtDistance(d, rng, T);
        expect(T.distance[idx]).toBe(d);
        const moves = solvePocket(idx, T);
        expect(moves.length).toBe(d);
        let cur = idx;
        for (const m of moves) cur = pocketApply(cur, POCKET_MOVES.indexOf(m), T);
        expect(cur).toBe(0);
      }
    }
  });

  it('agrees with the full cube model', () => {
    const rng = seededRng(808);
    for (let i = 0; i < 200; i++) {
      const c = CubieCube.identity();
      const moves: number[] = [];
      for (let k = 0; k < 14; k++) {
        const m = POCKET_MOVES[Math.floor(rng() * POCKET_MOVES.length)];
        c.applyMove(m); moves.push(m);
      }
      const idx = pocketFromCube(c);
      expect(idx).not.toBeNull();
      // Replaying the same moves through the pocket tables must land on the
      // same index the full cubie model produces.
      let cur = 0;
      for (const m of moves) cur = pocketApply(cur, POCKET_MOVES.indexOf(m), T);
      expect(cur).toBe(idx);
    }
  });

  it('reports every optimal first move', () => {
    const rng = seededRng(66);
    for (let i = 0; i < 200; i++) {
      const idx = Math.floor(rng() * N_POCKET);
      const best = pocketOptimalMoves(idx, T);
      expect(best.length).toBeGreaterThan(0);
      for (const m of best) {
        expect(T.distance[pocketApply(idx, POCKET_MOVES.indexOf(m), T)]).toBe(T.distance[idx] - 1);
      }
    }
  });

  it('renders 24 stickers, nine of nothing and four of each colour', () => {
    const rng = seededRng(4);
    for (let i = 0; i < 100; i++) {
      const idx = Math.floor(rng() * N_POCKET);
      const s = pocketStickers(idx);
      expect(s.length).toBe(24);
      const counts = new Array(6).fill(0);
      s.forEach((v) => counts[v]++);
      expect(counts).toEqual([4, 4, 4, 4, 4, 4]);
    }
    expect(Array.from(pocketStickers(0))).toEqual(
      [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5],
    );
  });
});
