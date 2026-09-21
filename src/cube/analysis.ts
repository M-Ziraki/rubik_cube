/**
 * Reading a cube state the way a solver does.
 *
 * These counts are what turns "do R U R'" into "this move flips two edges the
 * right way round and puts the front-right slice edge home". A move list with
 * no explanation is a spell; a move list with the invariants attached is an
 * argument.
 */

import type { CubieCube } from './cubie';
import { CORNER_NAMES, EDGE_NAMES, PHASE2_MOVES } from './defs';

export interface StateReport {
  orientedEdges: number;
  orientedCorners: number;
  sliceEdgesHome: number;
  solvedEdges: number;
  solvedCorners: number;
  solvedPieces: number;
  inG1: boolean;
  bottomCross: number;
  /** Pieces that are home and correctly oriented. */
  homePieces: string[];
}

export function report(c: CubieCube): StateReport {
  let orientedEdges = 0, orientedCorners = 0, sliceEdgesHome = 0;
  let solvedEdges = 0, solvedCorners = 0, bottomCross = 0;
  const homePieces: string[] = [];

  for (let i = 0; i < 12; i++) {
    if (c.eo[i] === 0) orientedEdges++;
    if (i >= 8 && c.ep[i] >= 8) sliceEdgesHome++;
    if (c.ep[i] === i && c.eo[i] === 0) {
      solvedEdges++;
      homePieces.push(EDGE_NAMES[i]);
      if (i >= 4 && i <= 7) bottomCross++;
    }
  }
  for (let i = 0; i < 8; i++) {
    if (c.co[i] === 0) orientedCorners++;
    if (c.cp[i] === i && c.co[i] === 0) { solvedCorners++; homePieces.push(CORNER_NAMES[i]); }
  }

  return {
    orientedEdges,
    orientedCorners,
    sliceEdgesHome,
    solvedEdges,
    solvedCorners,
    solvedPieces: solvedEdges + solvedCorners,
    inG1: orientedEdges === 12 && orientedCorners === 8 && sliceEdgesHome === 4,
    bottomCross,
    homePieces,
  };
}

/**
 * One observed effect of a move, as a dictionary key plus its numbers.
 *
 * Deliberately not a finished sentence: this module runs inside a worker and
 * has no idea which language the page is in. It reports *what changed*, which
 * is a fact about the permutation; the UI renders that fact in the reader's
 * language. Note that none of this claims to know *why* the search chose the
 * move - it cannot, and does not pretend to.
 */
export interface EffectNote {
  key: string;
  params?: Record<string, string | number>;
}

export interface MoveExplanation {
  move: number;
  before: StateReport;
  after: StateReport;
  /** What this move measurably did, as translatable notes. */
  effects: EffectNote[];
  phase: 'phase 1' | 'phase 2' | 'unstructured';
}

export interface SolutionNarrative {
  steps: MoveExplanation[];
  /**
   * How many moves make up phase one, or -1 when this route does not split
   * that way. The solver searches the cube from several viewpoints and may
   * invert it, so a returned solution is not guaranteed to pass through G1
   * partway: a route found on an inverted cube reaches G1 near its *start*,
   * and a route found about a different axis reaches a rotated copy of G1
   * that these counters do not track. Claiming a phase boundary that is not
   * there would be worse than saying nothing.
   */
  phaseBoundary: number;
}

/**
 * Walk a solution and describe, move by move, what it accomplishes.
 *
 * The narrative follows the two-phase structure because that is the structure
 * the solution actually has: everything up to the moment the cube lands in G1
 * is about *orientation*, and everything after is about *arrangement*.
 */
export function explainSolution(start: CubieCube, moves: number[]): SolutionNarrative {
  const boundary = findPhaseBoundary(start, moves);
  const out: MoveExplanation[] = [];
  const cube = start.clone();
  let before = report(cube);
  let announced = false;

  for (let step = 0; step < moves.length; step++) {
    const move = moves[step];
    cube.applyMove(move);
    const after = report(cube);
    const effects: EffectNote[] = [];

    const de = after.orientedEdges - before.orientedEdges;
    const dc = after.orientedCorners - before.orientedCorners;
    const ds = after.sliceEdgesHome - before.sliceEdgesHome;
    const dp = after.solvedPieces - before.solvedPieces;

    if (de > 0) effects.push({ key: 'effect.orientEdges', params: { n: de } });
    else if (de < 0) effects.push({ key: 'effect.misorientEdges', params: { n: -de } });
    if (dc > 0) effects.push({ key: 'effect.untwistCorners', params: { n: dc } });
    else if (dc < 0) effects.push({ key: 'effect.twistCorners', params: { n: -dc } });
    if (ds > 0) effects.push({ key: 'effect.sliceIn', params: { n: ds } });
    else if (ds < 0) effects.push({ key: 'effect.sliceOut', params: { n: -ds } });
    if (dp > 0) effects.push({ key: 'effect.piecesHome', params: { n: dp } });
    else if (dp < 0) effects.push({ key: 'effect.piecesDisplaced', params: { n: -dp } });

    if (!announced && boundary > 0 && step + 1 === boundary) {
      effects.push({ key: 'effect.entersG1' });
      announced = true;
    }
    if (effects.length === 0) {
      let movedCorners = 0, movedEdges = 0;
      for (let i = 0; i < 8; i++) if (before.homePieces.includes(CORNER_NAMES[i]) !== after.homePieces.includes(CORNER_NAMES[i])) movedCorners++;
      for (let i = 0; i < 12; i++) if (before.homePieces.includes(EDGE_NAMES[i]) !== after.homePieces.includes(EDGE_NAMES[i])) movedEdges++;
      const moved = movedCorners + movedEdges;
      effects.push(moved > 0
        ? { key: 'effect.shuffles', params: { n: moved } }
        : { key: 'effect.pureRearrangement' });
    }

    const phase: MoveExplanation['phase'] = boundary < 0
      ? 'unstructured'
      : step < boundary ? 'phase 1' : 'phase 2';
    out.push({ move, before, after, effects, phase });
    before = after;
  }
  return { steps: out, phaseBoundary: boundary };
}

/**
 * The move index at which the route enters G1 and never leaves it, or -1 when
 * the route has no such point. Being in G1 is not enough on its own: the tail
 * must also consist only of moves that keep it there.
 */
export function findPhaseBoundary(start: CubieCube, moves: number[]): number {
  const cube = start.clone();
  for (let i = 0; i < moves.length; i++) {
    if (report(cube).inG1 && moves.slice(i).every((m) => (PHASE2_MOVES as readonly number[]).includes(m))) {
      return i;
    }
    cube.applyMove(moves[i]);
  }
  return -1;
}
