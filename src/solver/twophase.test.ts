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

  it('solves a single move, and knows it could not be done in fewer', () => {
    for (let m = 0; m < 18; m++) {
      const c = CubieCube.identity().applyMove(m);
      const s = solveTwoPhase(c);
      expect(s.length).toBe(1);
      expect(c.clone().applyMoves(s.moves).isSolved()).toBe(true);
      expect(s.lowerBound).toBe(1);
      expect(s.guarantee).toBe('proven-optimal');
    }
  });

  it('solves the superflip, the hardest position there is', () => {
    // The superflip sits at distance exactly 20 and is fixed by every symmetry
    // of the cube, so the solver's six viewpoints collapse to one and there is
    // nothing to exploit. Reaching 20 takes it about 150 seconds; with a budget
    // a test can afford it lands a move or two above. What is checked here is
    // that the answer is always valid and always short - bench/superflip.ts is
    // where the long run lives.
    const scr = parseSequence("R L U2 F U' D F2 R2 B2 L U2 F' B' U R2 D F2 U R2 U").moves;
    const c = CubieCube.fromMoves(scr);
    const s = solveTwoPhase(c, { timeBudgetMs: 20000 });
    expect(c.clone().applyMoves(s.moves).isSolved()).toBe(true);
    expect(s.length).toBeGreaterThanOrEqual(20); // nothing shorter can exist
    expect(s.length).toBeLessThanOrEqual(23);
  }, 60000);

  it('solves uniformly random states within God’s number, every time', () => {
    const rng = seededRng(20260920);
    const lengths: number[] = [];
    const millis: number[] = [];
    for (let i = 0; i < 30; i++) {
      const c = randomState(rng);
      // goodEnough stops the search the moment it meets the target, which is
      // exactly the claim under test. Without it the search spends its whole
      // budget hunting for something shorter - useful in the app, slow here.
      const s = solveTwoPhase(c, { timeBudgetMs: 25000, maxLength: 20, goodEnough: 20 });
      expect(s.length).toBeGreaterThanOrEqual(0);
      expect(c.clone().applyMoves(s.moves).isSolved()).toBe(true);
      expect(s.length).toBeLessThanOrEqual(20);
      expect(s.length).toBeGreaterThanOrEqual(s.lowerBound);
      lengths.push(s.length);
      millis.push(s.millis);
    }
    const mean = (a: number[]): number => a.reduce((x, y) => x + y, 0) / a.length;
    expect(mean(lengths)).toBeLessThan(20);
    console.log(
      'random states:', lengths.join(' '),
      '| mean', mean(lengths).toFixed(2), '| max', Math.max(...lengths),
      '| median ms', [...millis].sort((a, b) => a - b)[millis.length >> 1],
    );
  }, 900000);

  it('solves random scrambles and never claims a wrong length', () => {
    const rng = seededRng(7);
    for (let i = 0; i < 25; i++) {
      const scr = randomMoveScramble(18, rng);
      const c = CubieCube.fromMoves(scr);
      const s = solveTwoPhase(c, { timeBudgetMs: 25000, goodEnough: 20 });
      expect(c.clone().applyMoves(s.moves).isSolved()).toBe(true);
      expect(s.moves.length).toBe(s.length);
      expect(s.length).toBeGreaterThanOrEqual(lowerBound(c));
      expect(s.length).toBeLessThanOrEqual(20);
    }
  }, 900000);

  it('keeps improving when asked to, and reports honestly when it stops', () => {
    const rng = seededRng(2024);
    const c = randomState(rng);
    const improvements: number[] = [];
    const s = solveTwoPhase(c, {
      timeBudgetMs: 6000,
      onImprove: (partial) => improvements.push(partial.length),
    });
    expect(c.clone().applyMoves(s.moves).isSolved()).toBe(true);
    // Every reported improvement must actually be an improvement.
    for (let i = 1; i < improvements.length; i++) {
      expect(improvements[i]).toBeLessThan(improvements[i - 1]);
    }
    expect(improvements[improvements.length - 1]).toBe(s.length);
    expect(s.guarantee).toBe(s.length <= s.lowerBound ? 'proven-optimal' : 'within-bound');
  }, 60000);
});
