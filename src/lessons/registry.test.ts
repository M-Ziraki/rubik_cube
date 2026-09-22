/**
 * The lesson registry's claims about the cube, checked against the cube.
 *
 * A lesson can send a learner to the Atlas with a sequence set up and tell
 * them how many repetitions bring it home. That number is a fact about the
 * group, not a matter of taste, and it is written in a file nobody runs - so
 * it is asserted here instead of trusted.
 */

import { describe, expect, it } from 'vitest';
import { LESSONS } from './registry';
import { CubieCube } from '../cube/cubie';
import { parseSequence } from '../cube/notation';

describe('lesson demonstrations', () => {
  it('parse without error', () => {
    for (const lesson of LESSONS) {
      if (!lesson.demo) continue;
      const { moves, errors } = parseSequence(lesson.demo.sequence);
      expect({ id: lesson.id, errors, empty: moves.length === 0 })
        .toEqual({ id: lesson.id, errors: [], empty: false });
    }
  });

  it('have the order the lesson claims', () => {
    for (const lesson of LESSONS) {
      if (!lesson.demo) continue;
      const { moves } = parseSequence(lesson.demo.sequence);
      const cube = new CubieCube();
      let n = 0;
      do {
        for (const m of moves) cube.applyMove(m);
        n += 1;
      } while (!cube.isSolved() && n < 2000);
      expect({ id: lesson.id, order: n }).toEqual({ id: lesson.id, order: lesson.demo.order });
    }
  });
});
