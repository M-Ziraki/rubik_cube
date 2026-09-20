import { describe, expect, it } from 'vitest';
import { CubieCube } from './cubie';
import { PHASE2_MOVES } from './defs';
import { parseSequence } from './notation';
import { explainSolution, findPhaseBoundary, report } from './analysis';
import { buildCoreTables } from '../solver/tables';
import { solveTwoPhase } from '../solver/twophase';
import { randomState, seededRng } from '../solver/scramble';
import { solveToG1 } from '../solver/stages';

buildCoreTables();

describe('state report', () => {
  it('a solved cube has everything home and is inside G1', () => {
    const r = report(CubieCube.identity());
    expect(r.solvedPieces).toBe(20);
    expect(r.orientedEdges).toBe(12);
    expect(r.orientedCorners).toBe(8);
    expect(r.sliceEdgesHome).toBe(4);
    expect(r.inG1).toBe(true);
    expect(r.bottomCross).toBe(4);
  });

  it('only quarter turns of F, B, L and R change orientation counts', () => {
    for (let m = 0; m < 18; m++) {
      const r = report(CubieCube.identity().applyMove(m));
      const isG1Move = (PHASE2_MOVES as readonly number[]).includes(m);
      if (isG1Move) {
        expect(r.orientedEdges).toBe(12);
        expect(r.orientedCorners).toBe(8);
        expect(r.sliceEdgesHome).toBe(4);
        expect(r.inG1).toBe(true);
      }
    }
  });

  it('recognises G1 exactly', () => {
    const rng = seededRng(3);
    for (let i = 0; i < 60; i++) {
      const c = CubieCube.identity();
      for (let k = 0; k < 20; k++) c.applyMove(PHASE2_MOVES[Math.floor(rng() * 10)]);
      expect(report(c).inG1).toBe(true);
    }
    for (let i = 0; i < 60; i++) {
      const c = randomState(rng);
      const inG1 = report(c).inG1;
      const toG1 = solveToG1(c);
      expect(inG1).toBe(toG1.distance === 0);
    }
  }, 120000);
});

describe('solution narrative', () => {
  it('produces one step per move, each describing something', () => {
    const rng = seededRng(21);
    for (let i = 0; i < 10; i++) {
      const cube = randomState(rng);
      const s = solveTwoPhase(cube, { timeBudgetMs: 3000 });
      const n = explainSolution(cube, s.moves);
      expect(n.steps.length).toBe(s.moves.length);
      for (const step of n.steps) expect(step.effects.length).toBeGreaterThan(0);
      expect(n.steps[n.steps.length - 1].after.solvedPieces).toBe(20);
    }
  }, 120000);

  it('reports a phase boundary only when the route really has one', () => {
    // A hand-built two-phase route: reach G1, then finish with G1 moves only.
    const scramble = parseSequence("R U2 F' L D B R' U F2 D'").moves;
    const cube = CubieCube.fromMoves(scramble);
    const toG1 = solveToG1(cube);
    const tail = [PHASE2_MOVES[0], PHASE2_MOVES[3], PHASE2_MOVES[8]];
    const route = [...toG1.moves, ...tail];
    expect(findPhaseBoundary(cube, route)).toBe(toG1.moves.length);

    // A route that leaves G1 again has no such point before the end.
    const broken = [...toG1.moves, 3 /* R */, 15 /* B */];
    const boundary = findPhaseBoundary(cube, broken);
    expect(boundary === -1 || boundary > toG1.moves.length).toBe(true);
  });

  it('never claims a boundary that the moves contradict', () => {
    const rng = seededRng(77);
    for (let i = 0; i < 20; i++) {
      const cube = randomState(rng);
      const s = solveTwoPhase(cube, { timeBudgetMs: 2500 });
      const n = explainSolution(cube, s.moves);
      if (n.phaseBoundary < 0) continue;
      // Everything from the boundary onwards must be a G1 generator...
      for (let k = n.phaseBoundary; k < s.moves.length; k++) {
        expect((PHASE2_MOVES as readonly number[]).includes(s.moves[k])).toBe(true);
      }
      // ...and the cube must genuinely be inside G1 at that point.
      const mid = cube.clone().applyMoves(s.moves.slice(0, n.phaseBoundary));
      expect(report(mid).inG1).toBe(true);
    }
  }, 180000);
});
