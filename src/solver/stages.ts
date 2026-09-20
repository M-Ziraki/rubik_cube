/**
 * Sub-goal solvers.
 *
 * A full solve is hard; a *piece* of a solve is often easy enough to solve
 * perfectly. Each stage here has a state space small enough to enumerate
 * completely, which means the answer is read out of a table rather than
 * searched for - and is therefore provably the shortest way to reach that
 * sub-goal.
 *
 * These are the rungs every solving method climbs, human or machine:
 *   - Orient the edges. The first step of Thistlethwaite's 1981 ladder, and
 *     the thing that makes F and B half-turn-only from then on.
 *   - Build the cross. The first step of every human layer method.
 *   - Reach G1. The first phase of Kociemba's algorithm.
 *
 * Solving a sub-goal optimally is not the same as solving the cube optimally,
 * and the app says so wherever it shows one.
 */

import type { CubieCube } from '../cube/cubie';
import { MOVE_CUBES } from '../cube/cubie';
import { MOVE_FACE, N_MOVES, isRedundant } from '../cube/defs';
import { N_FLIP, N_TWIST, getFlip, getSlice, getTwist } from './coords';
import { partialPermToIndex } from './permutil';
import { buildCoreTables } from './tables';

/* ------------------------------------------------- generic edge tracker --- */

interface EdgeTracker {
  k: number;
  arrangements: number;
  size: number;
  arrMove: Int32Array;
  flipMask: Uint8Array;
}

const INV_EP: Uint8Array[] = MOVE_CUBES.map((mc) => {
  const inv = new Uint8Array(12);
  for (let i = 0; i < 12; i++) inv[mc.ep[i]] = i;
  return inv;
});

const trackers = new Map<number, EdgeTracker>();

function edgeTracker(k: number): EdgeTracker {
  const hit = trackers.get(k);
  if (hit) return hit;
  let arrangements = 1;
  for (let i = 0; i < k; i++) arrangements *= 12 - i;
  const arrMove = new Int32Array(arrangements * N_MOVES);
  const flipMask = new Uint8Array(arrangements * N_MOVES);
  const loc = new Uint8Array(k);
  const nloc = new Uint8Array(k);
  for (let x = 0; x < arrangements; x++) {
    decodePartial(x, k, loc);
    const row = x * N_MOVES;
    for (let m = 0; m < N_MOVES; m++) {
      const inv = INV_EP[m];
      const eo = MOVE_CUBES[m].eo;
      let bits = 0;
      for (let i = 0; i < k; i++) {
        const to = inv[loc[i]];
        nloc[i] = to;
        if (eo[to]) bits |= 1 << i;
      }
      arrMove[row + m] = partialPermToIndex(nloc, k, 12);
      flipMask[row + m] = bits;
    }
  }
  const t: EdgeTracker = { k, arrangements, size: arrangements * (1 << k), arrMove, flipMask };
  trackers.set(k, t);
  return t;
}

function decodePartial(idx: number, k: number, out: Uint8Array): void {
  const digits = new Uint8Array(k);
  for (let i = k - 1; i >= 0; i--) {
    const radix = 12 - i;
    digits[i] = idx % radix;
    idx = Math.floor(idx / radix);
  }
  const avail: number[] = [];
  for (let i = 0; i < 12; i++) avail.push(i);
  for (let i = 0; i < k; i++) out[i] = avail.splice(digits[i], 1)[0];
}

function edgeStateIndex(cube: CubieCube, pieces: number[], t: EdgeTracker): number {
  const loc = new Uint8Array(t.k);
  let ori = 0;
  for (let i = 0; i < t.k; i++) {
    let at = -1;
    for (let j = 0; j < 12; j++) if (cube.ep[j] === pieces[i]) { at = j; break; }
    loc[i] = at;
    if (cube.eo[at]) ori |= 1 << i;
  }
  return partialPermToIndex(loc, t.k, 12) * (1 << t.k) + ori;
}

/* ------------------------------------------------------------ the cross --- */

export const CROSS_EDGES = [4, 5, 6, 7]; // DR DF DL DB

let crossTable: Uint8Array | null = null;

export function buildCrossTable(): Uint8Array {
  if (crossTable) return crossTable;
  const t = edgeTracker(4);
  const table = new Uint8Array(t.size).fill(255);
  const goalArr = partialPermToIndex(Uint8Array.from(CROSS_EDGES), 4, 12);
  table[goalArr * 16] = 0;
  let depth = 0;
  for (;;) {
    let added = 0;
    for (let idx = 0; idx < t.size; idx++) {
      if (table[idx] !== depth) continue;
      const a = (idx / 16) | 0;
      const o = idx & 15;
      const row = a * N_MOVES;
      for (let m = 0; m < N_MOVES; m++) {
        const j = t.arrMove[row + m] * 16 + (o ^ t.flipMask[row + m]);
        if (table[j] === 255) { table[j] = depth + 1; added++; }
      }
    }
    if (added === 0) break;
    depth++;
  }
  crossTable = table;
  return table;
}

export interface StageResult {
  moves: number[];
  distance: number;
  /** True when this sequence is the shortest possible way to reach the goal. */
  optimal: boolean;
  goal: string;
}

/** The provably shortest way to build the bottom cross. */
export function solveCross(cube: CubieCube): StageResult {
  const t = edgeTracker(4);
  const table = buildCrossTable();
  let idx = edgeStateIndex(cube, CROSS_EDGES, t);
  const moves: number[] = [];
  const distance = table[idx];
  let guard = 0;
  while (table[idx] > 0 && guard++ < 40) {
    const want = table[idx] - 1;
    for (let m = 0; m < N_MOVES; m++) {
      const a = (idx / 16) | 0;
      const o = idx & 15;
      const j = t.arrMove[a * N_MOVES + m] * 16 + (o ^ t.flipMask[a * N_MOVES + m]);
      if (table[j] === want) { moves.push(m); idx = j; break; }
    }
  }
  return { moves, distance, optimal: true, goal: 'the four bottom-layer edges in place' };
}

export function crossTableStats(): { size: number; histogram: number[]; diameter: number } {
  const table = buildCrossTable();
  const histogram: number[] = [];
  let diameter = 0;
  for (let i = 0; i < table.length; i++) {
    const v = table[i];
    if (v === 255) continue;
    histogram[v] = (histogram[v] ?? 0) + 1;
    if (v > diameter) diameter = v;
  }
  for (let i = 0; i <= diameter; i++) if (!histogram[i]) histogram[i] = 0;
  return { size: table.length, histogram, diameter };
}

/* -------------------------------------------------- orienting the edges --- */

let flipTable: Uint8Array | null = null;

export function buildFlipTable(): Uint8Array {
  if (flipTable) return flipTable;
  const T = buildCoreTables();
  const table = new Uint8Array(N_FLIP).fill(255);
  table[0] = 0;
  let depth = 0;
  for (;;) {
    let added = 0;
    for (let x = 0; x < N_FLIP; x++) {
      if (table[x] !== depth) continue;
      for (let m = 0; m < N_MOVES; m++) {
        const j = T.flipMove[x * N_MOVES + m];
        if (table[j] === 255) { table[j] = depth + 1; added++; }
      }
    }
    if (added === 0) break;
    depth++;
  }
  flipTable = table;
  return table;
}

/**
 * The provably shortest way to orient every edge - the first rung of
 * Thistlethwaite's subgroup ladder, and the point after which F and B are
 * only ever needed as half turns.
 */
export function solveEdgeOrientation(cube: CubieCube): StageResult {
  const T = buildCoreTables();
  const table = buildFlipTable();
  let flip = getFlip(cube);
  const distance = table[flip];
  const moves: number[] = [];
  let guard = 0;
  while (table[flip] > 0 && guard++ < 20) {
    const want = table[flip] - 1;
    for (let m = 0; m < N_MOVES; m++) {
      const j = T.flipMove[flip * N_MOVES + m];
      if (table[j] === want) { moves.push(m); flip = j; break; }
    }
  }
  return { moves, distance, optimal: true, goal: 'every edge the right way round' };
}

export function flipTableStats(): { size: number; histogram: number[]; diameter: number } {
  const table = buildFlipTable();
  const histogram: number[] = [];
  let diameter = 0;
  for (let i = 0; i < table.length; i++) {
    histogram[table[i]] = (histogram[table[i]] ?? 0) + 1;
    if (table[i] > diameter) diameter = table[i];
  }
  for (let i = 0; i <= diameter; i++) if (!histogram[i]) histogram[i] = 0;
  return { size: table.length, histogram, diameter };
}

/* ---------------------------------------------------------- reaching G1 --- */

/**
 * The shortest route into G1 = <U, D, L2, R2, F2, B2>: every edge oriented,
 * every corner oriented, and the four middle-slice edges back in the middle
 * slice. This is phase one of the two-phase algorithm, on its own.
 */
export function solveToG1(cube: CubieCube, maxDepth = 12): StageResult {
  const T = buildCoreTables();
  const path = new Int32Array(20);
  let found = -1;

  const search = (depth: number, remaining: number, twist: number, flip: number, slice: number, prevFace: number): boolean => {
    if (remaining === 0) return twist === 0 && flip === 0 && slice === 0;
    const h = Math.max(
      T.pruneTwistSlice[slice * N_TWIST + twist],
      T.pruneFlipSlice[slice * N_FLIP + flip],
      T.pruneFlipTwist[flip * N_TWIST + twist],
    );
    if (h > remaining) return false;
    for (let m = 0; m < N_MOVES; m++) {
      const face = MOVE_FACE[m];
      if (isRedundant(prevFace, face)) continue;
      path[depth] = m;
      if (search(
        depth + 1, remaining - 1,
        T.twistMove[twist * N_MOVES + m],
        T.flipMove[flip * N_MOVES + m],
        T.sliceMove[slice * N_MOVES + m],
        face,
      )) return true;
    }
    return false;
  };

  const twist = getTwist(cube), flip = getFlip(cube), slice = getSlice(cube);
  for (let d = 0; d <= maxDepth; d++) {
    if (search(0, d, twist, flip, slice, -1)) { found = d; break; }
  }
  if (found < 0) return { moves: [], distance: -1, optimal: false, goal: 'inside the subgroup G1' };
  return {
    moves: Array.from(path.subarray(0, found)),
    distance: found,
    optimal: true,
    goal: 'inside the subgroup G1 — nothing misoriented, slice edges home',
  };
}
