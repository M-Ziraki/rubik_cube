/**
 * The provably-optimal solver: iterative-deepening A* over the real cube
 * group, with no phase decomposition and no shortcuts.
 *
 * How it can honestly claim optimality: IDA* searches for a solution of length
 * exactly 1, then exactly 2, and so on. If the pass at length N finishes
 * without finding anything, then *no solution of length N exists* - that is a
 * proof, not an estimate. So when a solution first appears at length N, every
 * shorter length has already been ruled out and N is the true distance.
 *
 * The cost is brutal. Random cube positions sit 17 or 18 moves from solved and
 * the search tree grows by a factor of about 13 per move, so proving
 * optimality for a scrambled cube is out of reach for a web page: Rokicki's
 * proof of God's number used years of donated CPU time. What this solver does
 * reach - positions within roughly a dozen moves of solved - is enough to see
 * the machinery work, to check the two-phase answers, and to grade the
 * challenges exactly.
 *
 * When the budget runs out the search still returns something worth having: a
 * *proven lower bound*, because every completed pass rules out a length.
 */

import type { CubieCube } from '../cube/cubie';
import { MOVE_FACE, N_MOVES, isRedundant } from '../cube/defs';
import { N_FLIP, N_TWIST, getCornerPerm, getFlip, getSlice, getTwist } from './coords';
import { EDGE_SET_A, EDGE_SET_B, edge5Index } from './heuristic';
import { buildCoreTables, buildOptimalTables, type ProgressFn } from './tables';
import type { Solution } from './twophase';

export interface OptimalOptions {
  /** Never look beyond this length. Default 20. */
  maxLength?: number;
  /** Wall-clock budget in milliseconds. Default 20000. */
  timeBudgetMs?: number;
  /** Node budget; the search also stops when this is exhausted. */
  maxNodes?: number;
  /** Called once per completed depth, with the newly proven lower bound. */
  onDepth?: (provenLowerBound: number, nodes: number) => void;
  onTables?: ProgressFn;
}

export interface OptimalResult extends Solution {
  /** Lengths 1..provenLowerBound-1 have been exhaustively ruled out. */
  provenLowerBound: number;
  /** True when the search completed a pass rather than running out of budget. */
  complete: boolean;
}

export function solveOptimal(cube: CubieCube, opts: OptimalOptions = {}): OptimalResult {
  const T = buildCoreTables();
  const O = buildOptimalTables(opts.onTables);
  const started = Date.now();
  const maxLength = opts.maxLength ?? 20;
  const budget = opts.timeBudgetMs ?? 20000;
  const nodeBudget = opts.maxNodes ?? Number.MAX_SAFE_INTEGER;

  let nodes = 0;
  let stopped = false;
  let tick = 0;
  const path = new Int32Array(32);

  const outOfBudget = (): boolean => {
    if (stopped) return true;
    if (++tick % 4096 !== 0) return nodes > nodeBudget;
    if (Date.now() - started > budget || nodes > nodeBudget) { stopped = true; return true; }
    return false;
  };

  const heuristic = (
    twist: number, flip: number, slice: number, cp: number,
    arrA: number, oriA: number, arrB: number, oriB: number,
  ): number => Math.max(
    T.pruneTwistSlice[slice * N_TWIST + twist],
    T.pruneFlipSlice[slice * N_FLIP + flip],
    T.pruneFlipTwist[flip * N_TWIST + twist],
    O.pdbCornerPerm[cp],
    O.pdbEdgeA[arrA * 32 + oriA],
    O.pdbEdgeB[arrB * 32 + oriB],
  );

  const search = (
    depth: number, remaining: number,
    twist: number, flip: number, slice: number, cp: number,
    arrA: number, oriA: number, arrB: number, oriB: number,
    prevFace: number,
  ): boolean => {
    nodes++;
    if (twist === 0 && flip === 0 && slice === 0 && cp === 0
      && arrA === O.solvedArrA && oriA === 0 && arrB === O.solvedArrB && oriB === 0) {
      // All six projections solved simultaneously means the cube is solved.
      return true;
    }
    if (remaining === 0) return false;
    if (heuristic(twist, flip, slice, cp, arrA, oriA, arrB, oriB) > remaining) return false;
    if (outOfBudget()) return false;
    for (let m = 0; m < N_MOVES; m++) {
      const face = MOVE_FACE[m];
      if (isRedundant(prevFace, face)) continue;
      path[depth] = m;
      const rowA = arrA * N_MOVES + m;
      const rowB = arrB * N_MOVES + m;
      if (search(
        depth + 1, remaining - 1,
        T.twistMove[twist * N_MOVES + m],
        T.flipMove[flip * N_MOVES + m],
        T.sliceMove[slice * N_MOVES + m],
        T.cornerPermMove[cp * N_MOVES + m],
        O.edge5ArrMove[rowA], oriA ^ O.edge5FlipMask[rowA],
        O.edge5ArrMove[rowB], oriB ^ O.edge5FlipMask[rowB],
        face,
      )) return true;
      if (stopped) return false;
    }
    return false;
  };

  const idxA = edge5Index(cube, EDGE_SET_A);
  const idxB = edge5Index(cube, EDGE_SET_B);
  const start = {
    twist: getTwist(cube), flip: getFlip(cube), slice: getSlice(cube), cp: getCornerPerm(cube),
    arrA: (idxA / 32) | 0, oriA: idxA & 31, arrB: (idxB / 32) | 0, oriB: idxB & 31,
  };
  const h0 = heuristic(start.twist, start.flip, start.slice, start.cp, start.arrA, start.oriA, start.arrB, start.oriB);

  let proven = cube.isSolved() ? 0 : Math.max(1, h0);
  for (let depth = proven; depth <= maxLength; depth++) {
    const hit = search(
      0, depth, start.twist, start.flip, start.slice, start.cp,
      start.arrA, start.oriA, start.arrB, start.oriB, -1,
    );
    if (hit) {
      const moves = Array.from(path.subarray(0, depth)).slice(0, depth);
      const trimmed = trimToSolution(cube, moves);
      return {
        moves: trimmed, length: trimmed.length, guarantee: 'proven-optimal',
        lowerBound: trimmed.length, engine: 'optimal-ida', nodes,
        millis: Date.now() - started, provenLowerBound: trimmed.length, complete: true,
      };
    }
    if (stopped) {
      return {
        moves: [], length: -1, guarantee: 'found', lowerBound: proven,
        engine: 'optimal-ida', nodes, millis: Date.now() - started,
        timedOut: true, provenLowerBound: proven, complete: false,
      };
    }
    proven = depth + 1;
    opts.onDepth?.(proven, nodes);
  }
  return {
    moves: [], length: -1, guarantee: 'found', lowerBound: Math.min(proven, maxLength + 1),
    engine: 'optimal-ida', nodes, millis: Date.now() - started,
    provenLowerBound: Math.min(proven, maxLength + 1), complete: true,
  };
}

/**
 * The recursion reports success as soon as the state is solved, which may
 * happen before `remaining` reaches zero. Replay to find the real endpoint.
 */
function trimToSolution(cube: CubieCube, moves: number[]): number[] {
  const c = cube.clone();
  for (let i = 0; i < moves.length; i++) {
    if (c.isSolved()) return moves.slice(0, i);
    c.applyMove(moves[i]);
  }
  if (!c.isSolved()) throw new Error('optimal search produced a sequence that does not solve the cube');
  return moves;
}
