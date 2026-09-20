/**
 * The admissible heuristic used by the provably-optimal search.
 *
 * Every component below is the *exact* shortest distance in a simplified
 * version of the cube - one where we deliberately stop tracking most of the
 * pieces. Forgetting information can only ever make a puzzle easier, so each
 * number is a guaranteed lower bound on the real distance, and the largest of
 * them is the best bound we have. That is the entire theory behind a pattern
 * database.
 */

import type { CubieState } from '../cube/cubie';
import { N_FLIP, N_TWIST, getCornerPerm, getFlip, getSlice, getTwist } from './coords';
import { partialPermToIndex } from './permutil';
import { buildCoreTables, type OptimalTables } from './tables';

const EDGE_SET_A = [0, 1, 2, 3, 4];  // UR UF UL UB DR
const EDGE_SET_B = [5, 6, 7, 8, 9];  // DF DL DB FR FL

function edge5Index(c: CubieState, pieces: number[]): number {
  const loc = new Uint8Array(5);
  let ori = 0;
  for (let k = 0; k < 5; k++) {
    const piece = pieces[k];
    let at = -1;
    for (let j = 0; j < 12; j++) if (c.ep[j] === piece) { at = j; break; }
    loc[k] = at;
    if (c.eo[at]) ori |= 1 << k;
  }
  return partialPermToIndex(loc, 5, 12) * 32 + ori;
}

export function optimalHeuristic(c: CubieState, O: OptimalTables): number {
  const T = buildCoreTables();
  const twist = getTwist(c), flip = getFlip(c), slice = getSlice(c);
  return Math.max(
    T.pruneTwistSlice[slice * N_TWIST + twist],
    T.pruneFlipSlice[slice * N_FLIP + flip],
    T.pruneFlipTwist[flip * N_TWIST + twist],
    O.pdbCornerPerm[getCornerPerm(c)],
    O.pdbEdgeA[edge5Index(c, EDGE_SET_A)],
    O.pdbEdgeB[edge5Index(c, EDGE_SET_B)],
  );
}

export { EDGE_SET_A, EDGE_SET_B, edge5Index };
