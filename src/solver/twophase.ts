/**
 * Kociemba's two-phase algorithm.
 *
 * Inside the full cube group G there is a subgroup
 *
 *     G1 = < U, D, L2, R2, F2, B2 >
 *
 * of 19,508,428,800 states: the positions reachable from solved without ever
 * flipping an edge, twisting a corner, or moving a middle-slice edge out of
 * the middle slice. Every state of the cube is at most 12 moves from *some*
 * member of G1, and every member of G1 is at most 18 moves from solved.
 *
 * So instead of searching one graph with 4.3x10^19 vertices we search two much
 * smaller ones in sequence - "get into G1", then "walk home inside G1" - each
 * with IDA* guided by exact distances in an abstracted puzzle.
 *
 * Chaining two locally good searches does not give a globally optimal answer,
 * and that is precisely why God's number was hard to prove. This solver
 * therefore keeps looking for shorter routes until its time runs out, and it
 * never claims an answer is shortest unless the length happens to meet a
 * proven lower bound.
 *
 * Three implementation choices do most of the work:
 *
 *  1. Phase 2 is capped at a modest length. There are so many ways into G1
 *     that discarding a route with a long tail and trying another one is far
 *     cheaper than searching that tail exhaustively.
 *  2. The search runs from six starting points at once - the cube seen with
 *     three different axes pointing up, each both forwards and inverted. A
 *     position that is awkward about one axis is usually easy about another.
 *  3. Every candidate is replayed on a real cube before it is accepted.
 */

import { CubieCube } from '../cube/cubie';
import { MOVE_FACE, MOVE_POWER, N_MOVES, PHASE2_MOVES, isRedundant } from '../cube/defs';
import { fromFacelets, toFacelets } from '../cube/facelet';
import { ROT_X, ROT_Z, invertFacePerm, reorientFacelets, reorientation } from '../cube/geometry';
import { invertSequence, simplifySequence } from '../cube/notation';
import {
  N_CORNER_PERM, N_EDGE8_PERM, N_FLIP, N_TWIST,
  getCornerPerm, getEdge8Perm, getFlip, getSlice, getSlicePerm, getTwist,
} from './coords';
import { optimalHeuristic } from './heuristic';
import { buildCoreTables, getOptimalTablesSync, type CoreTables } from './tables';

export type Guarantee = 'proven-optimal' | 'within-bound' | 'found';

export interface Solution {
  moves: number[];
  length: number;
  /** What can honestly be claimed about this answer. */
  guarantee: Guarantee;
  /** No solution shorter than this exists. Proven by admissible heuristics. */
  lowerBound: number;
  engine: 'two-phase' | 'optimal-ida' | 'pocket-bfs' | 'trivial';
  nodes: number;
  millis: number;
  timedOut?: boolean;
}

export interface TwoPhaseOptions {
  /** The length we are aiming for. Default 20 - God's number. */
  maxLength?: number;
  /**
   * A solution longer than this is never accepted at all. Starting the search
   * with a loose limit and tightening it every time a shorter answer turns up
   * is much faster than insisting on the target from the first move: an early
   * answer, however mediocre, prunes the rest of the search hard.
   */
  hardLimit?: number;
  /** Stop as soon as a solution of at most this length is in hand. */
  goodEnough?: number;
  /** Wall-clock budget in milliseconds. Default 3000. */
  timeBudgetMs?: number;
  /** Deepest route into G1 to consider. Default 12, which is always enough. */
  maxPhase1Depth?: number;
  /** Longest tail inside G1 to consider for any single route. Default 12. */
  maxPhase2Depth?: number;
  onImprove?: (s: Solution) => void;
}

/**
 * A lower bound on the true distance from `cube` to solved that is guaranteed
 * never to be too large. Each ingredient is an exact distance in a simplified
 * puzzle; forgetting information can only make a puzzle easier.
 */
export function lowerBound(cube: CubieCube, T: CoreTables = buildCoreTables()): number {
  if (cube.isSolved()) return 0;
  const twist = getTwist(cube), flip = getFlip(cube), slice = getSlice(cube);
  let h = Math.max(
    1, // it is not solved, so it needs at least one move
    T.pruneTwistSlice[slice * N_TWIST + twist],
    T.pruneFlipSlice[slice * N_FLIP + flip],
    T.pruneFlipTwist[flip * N_TWIST + twist],
  );
  const O = getOptimalTablesSync();
  if (O) h = Math.max(h, optimalHeuristic(cube, O));
  return h;
}

/* ------------------------------------------------------- search frames --- */

interface Frame {
  name: string;
  cube: CubieCube;
  /** Translate a solution found in this frame back to the original cube. */
  back: (moves: number[]) => number[];
}

const AXIS_ROTATIONS = [
  { name: 'U-D axis', rot: null },
  { name: 'F-B axis', rot: reorientation('x', ROT_X) },
  { name: 'R-L axis', rot: reorientation('z', ROT_Z) },
];

function buildFrames(cube: CubieCube): Frame[] {
  const frames: Frame[] = [];
  // Highly symmetric positions - the superflip is the famous one - look
  // identical from several of these viewpoints. Searching the same tree six
  // times over would waste most of the budget, so keep one copy of each.
  const seen = new Set<string>();
  for (const axis of AXIS_ROTATIONS) {
    let viewed = cube;
    let renameBack = (m: number) => m;
    if (axis.rot) {
      viewed = fromFacelets(reorientFacelets(toFacelets(cube), axis.rot));
      const inv = invertFacePerm(axis.rot.facePerm);
      renameBack = (m: number) => inv[MOVE_FACE[m]] * 3 + (MOVE_POWER[m] - 1);
    }
    const inverted = viewed.inverse();
    if (!seen.has(viewed.key())) {
      seen.add(viewed.key());
      frames.push({ name: axis.name, cube: viewed, back: (moves) => moves.map(renameBack) });
    }
    if (!seen.has(inverted.key())) {
      seen.add(inverted.key());
      frames.push({
        name: `${axis.name} (inverse)`,
        cube: inverted,
        back: (moves) => invertSequence(moves).map(renameBack),
      });
    }
  }
  return frames;
}

/* --------------------------------------------------------------- search --- */

export function solveTwoPhase(cube: CubieCube, opts: TwoPhaseOptions = {}): Solution {
  const T = buildCoreTables();
  const started = Date.now();
  const maxLength = opts.maxLength ?? 20;
  const goodEnough = opts.goodEnough ?? 0;
  const budget = opts.timeBudgetMs ?? 3000;
  const hardLimit = Math.max(maxLength, opts.hardLimit ?? 24);
  const maxP1 = Math.min(opts.maxPhase1Depth ?? 13, hardLimit);
  const maxP2 = opts.maxPhase2Depth ?? 13;

  const lb = lowerBound(cube, T);
  if (cube.isSolved()) {
    return { moves: [], length: 0, guarantee: 'proven-optimal', lowerBound: 0, engine: 'trivial', nodes: 0, millis: 0 };
  }

  let nodes = 0;
  let best: number[] | null = null;
  let timedOut = false;
  let tick = 0;
  const bestLen = (): number => (best === null ? hardLimit + 1 : best.length);

  const outOfTime = (): boolean => {
    if (timedOut) return true;
    if (++tick % 2048 !== 0) return false;
    if (Date.now() - started > budget) { timedOut = true; return true; }
    return false;
  };
  const satisfied = (): boolean => bestLen() <= Math.max(lb, goodEnough);

  const p1moves = new Int32Array(40);
  const p2moves = new Int32Array(40);

  /* --- one frame's search -------------------------------------------- */
  const runFrame = (frame: Frame, d1: number): void => {
    const start = frame.cube;

    const accept = (raw: number[]): void => {
      const translated = simplifySequence(frame.back(raw));
      if (translated.length >= bestLen()) return;
      if (!cube.clone().applyMoves(translated).isSolved()) return; // never trust an unverified answer
      best = translated;
      opts.onImprove?.(makeSolution(translated, lb, nodes, Date.now() - started, maxLength, 'two-phase'));
    };

    const searchPhase2 = (
      depth: number, remaining: number,
      cornerPerm: number, edge8: number, slicePerm: number, prevFace: number,
    ): boolean => {
      nodes++;
      if (remaining === 0) return cornerPerm === 0 && edge8 === 0 && slicePerm === 0;
      const h = Math.max(
        T.pruneP2Corner[slicePerm * N_CORNER_PERM + cornerPerm],
        T.pruneP2Edge[slicePerm * N_EDGE8_PERM + edge8],
      );
      if (h > remaining) return false;
      for (let j = 0; j < 10; j++) {
        const move = PHASE2_MOVES[j];
        const face = MOVE_FACE[move];
        // Across the phase boundary only a repeat of the same face is barred:
        // the canonical ordering of commuting faces belongs to one phase's own
        // move list, and imposing it here would hide legitimate short tails.
        if (depth === 0 ? face === prevFace : isRedundant(prevFace, face)) continue;
        p2moves[depth] = move;
        if (searchPhase2(
          depth + 1, remaining - 1,
          T.cornerPermMoveP2[cornerPerm * 10 + j],
          T.edge8PermMove[edge8 * 10 + j],
          T.slicePermMove[slicePerm * 10 + j],
          face,
        )) return true;
      }
      return false;
    };

    const onReachingG1 = (len: number, cornerPermSoFar: number): boolean => {
      const cap = Math.min(maxP2, bestLen() - 1 - len);
      if (cap < 0) return true;
      // Rebuilding the cube costs far more than a table read, so reject the
      // hopeless routes first: this is the best any slice order could do.
      if (T.minP2CornerOverSlice[cornerPermSoFar] > cap) return satisfied() || outOfTime();
      const mid = start.clone();
      for (let i = 0; i < len; i++) mid.applyMove(p1moves[i]);
      const cornerPerm = cornerPermSoFar;
      const edge8 = getEdge8Perm(mid);
      const slicePerm = getSlicePerm(mid);
      const h2 = Math.max(
        T.pruneP2Corner[slicePerm * N_CORNER_PERM + cornerPerm],
        T.pruneP2Edge[slicePerm * N_EDGE8_PERM + edge8],
      );
      const lastFace = len > 0 ? MOVE_FACE[p1moves[len - 1]] : -1;
      for (let d2 = h2; d2 <= cap; d2++) {
        if (outOfTime()) return true;
        if (searchPhase2(0, d2, cornerPerm, edge8, slicePerm, lastFace)) {
          const raw: number[] = [];
          for (let i = 0; i < len; i++) raw.push(p1moves[i]);
          for (let i = 0; i < d2; i++) raw.push(p2moves[i]);
          accept(raw);
          break;
        }
      }
      return satisfied() || outOfTime();
    };

    const searchPhase1 = (
      depth: number, remaining: number,
      twist: number, flip: number, slice: number, cornerPerm: number, prevFace: number,
    ): boolean => {
      nodes++;
      if (remaining === 0) {
        if (twist === 0 && flip === 0 && slice === 0) return onReachingG1(depth, cornerPerm);
        return false;
      }
      const h = Math.max(
        T.pruneTwistSlice[slice * N_TWIST + twist],
        T.pruneFlipSlice[slice * N_FLIP + flip],
        T.pruneFlipTwist[flip * N_TWIST + twist],
      );
      if (h > remaining) return false;
      if (outOfTime()) return true;
      for (let m = 0; m < N_MOVES; m++) {
        const face = MOVE_FACE[m];
        if (isRedundant(prevFace, face)) continue;
        p1moves[depth] = m;
        if (searchPhase1(
          depth + 1, remaining - 1,
          T.twistMove[twist * N_MOVES + m],
          T.flipMove[flip * N_MOVES + m],
          T.sliceMove[slice * N_MOVES + m],
          T.cornerPermMove[cornerPerm * N_MOVES + m],
          face,
        )) return true;
      }
      return false;
    };

    searchPhase1(0, d1, getTwist(start), getFlip(start), getSlice(start), getCornerPerm(start), -1);
  };

  const frames = buildFrames(cube);
  outer:
  for (let d1 = 0; d1 <= maxP1; d1++) {
    for (const frame of frames) {
      if (timedOut || satisfied() || bestLen() <= d1) break outer;
      runFrame(frame, d1);
    }
    // Once the target is met there is no need to keep burning the budget
    // unless the caller explicitly asked to keep improving.
    if (bestLen() <= Math.max(lb, goodEnough)) break;
  }

  const found: number[] | null = best;
  if (found === null) {
    return {
      moves: [], length: -1, guarantee: 'found', lowerBound: lb,
      engine: 'two-phase', nodes, millis: Date.now() - started, timedOut: true,
    };
  }
  return makeSolution(found, lb, nodes, Date.now() - started, maxLength, 'two-phase', timedOut);
}

export function makeSolution(
  moves: number[], lb: number, nodes: number, millis: number, maxLength: number,
  engine: Solution['engine'] = 'two-phase', timedOut = false,
): Solution {
  let guarantee: Guarantee = 'found';
  if (moves.length <= lb) guarantee = 'proven-optimal';
  else if (moves.length <= maxLength) guarantee = 'within-bound';
  return { moves, length: moves.length, guarantee, lowerBound: lb, engine, nodes, millis, timedOut };
}

/** Convenience wrapper that throws if nothing was found. */
export function quickSolve(cube: CubieCube, timeBudgetMs = 2000): number[] {
  const s = solveTwoPhase(cube, { timeBudgetMs });
  if (s.length < 0) throw new Error('No solution found within the time budget.');
  return s.moves;
}
