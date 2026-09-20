import { describe, expect, it } from 'vitest';
import { CubieCube } from '../cube/cubie';
import { parseSequence } from '../cube/notation';
import { lowerBound, solveTwoPhase } from './twophase';
import { randomMoveScramble, randomState, seededRng } from './scramble';
import { buildCoreTables } from './tables';

buildCoreTables();

describe('two-phase solver', () => {
  it('returns an empty solution for a solved cube', () => {
    const s = solveTwoPhase(CubieCube.identity());
    expect(s.length).toBe(0);
    expect(s.guarantee).toBe('proven-optimal');
  });

  it('solves a single move', () => {
    for (let m = 0; m < 18; m++) {
      const c = CubieCube.identity().applyMove(m);
      const s = solveTwoPhase(c);
      expect(s.length).toBe(1);
      expect(c.clone().applyMoves(s.moves).isSolved()).toBe(true);
      expect(s.guarantee).toBe('proven-optimal');
      expect(s.lowerBound).toBe(1);
    }
  });

  it('solves the superflip in at most 20 moves', () => {
    const scr = parseSequence("R L U2 F U' D F2 R2 B2 L U2 F' B' U R2 D F2 U R2 U").moves;
    const c = CubieCube.fromMoves(scr);
    const s = solveTwoPhase(c, { timeBudgetMs: 8000 });
    expect(c.clone().applyMoves(s.moves).isSolved()).toBe(true);
    expect(s.length).toBeLessThanOrEqual(20);
  });

  it('solves 60 uniformly random states within God’s number', () => {
    const rng = seededRng(20260920);
    const lengths: number[] = [];
    for (let i = 0; i < 60; i++) {
      const c = randomState(rng);
      const s = solveTwoPhase(c, { timeBudgetMs: 6000, maxLength: 20 });
      expect(s.length).toBeGreaterThanOrEqual(0);
      expect(c.clone().applyMoves(s.moves).isSolved()).toBe(true);
      expect(s.length).toBeLessThanOrEqual(20);
      expect(s.length).toBeGreaterThanOrEqual(s.lowerBound);
      lengths.push(s.length);
    }
    const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    // Random states sit at distance 17-18 almost always; a good two-phase
    // search should land within a move or two of that.
    expect(avg).toBeLessThan(20);
    console.log('random-state solutions:', lengths.join(' '), '| mean', avg.toFixed(2), '| max', Math.max(...lengths));
  }, 600000);

  it('solves random scrambles and never claims a wrong length', () => {
    const rng = seededRng(7);
    for (let i = 0; i < 40; i++) {
      const scr = randomMoveScramble(18, rng);
      const c = CubieCube.fromMoves(scr);
      const s = solveTwoPhase(c, { timeBudgetMs: 4000 });
      expect(c.clone().applyMoves(s.moves).isSolved()).toBe(true);
      expect(s.moves.length).toBe(s.length);
      expect(s.length).toBeGreaterThanOrEqual(lowerBound(c));
    }
  }, 300000);
});
