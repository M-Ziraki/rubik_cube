/**
 * Lookup tables.
 *
 * Two kinds live here:
 *
 *  - MOVE tables answer "if the cube has coordinate c and I turn face m, what
 *    is the new coordinate?" They turn a group operation into an array read.
 *  - PRUNING tables answer "given this coordinate, what is the *smallest*
 *    number of moves that could possibly still be needed?" They are exact
 *    shortest-path distances inside a simplified version of the puzzle, found
 *    by breadth-first search from the solved state. Because every simplified
 *    problem is easier than the real one, these numbers are lower bounds, and
 *    a lower bound is exactly what A*-style search needs to prune safely.
 *
 * Everything is built once, in a Web Worker, and reused.
 */

import { MOVE_CUBES } from '../cube/cubie';
import { N_MOVES, PHASE2_MOVES } from '../cube/defs';
import {
  N_CORNER_PERM, N_EDGE5, N_EDGE5_ARRANGEMENT, N_EDGE8_PERM, N_FLIP, N_SLICE,
  N_SLICE_PERM, N_TWIST, edge5Arrangement, edge5Locations, setFlip, setSlice,
  setSlicePerm, setTwist, sliceFromEp, slicePermFromEp,
} from './coords';
import { indexToPerm, permToIndex } from './permutil';

export type ProgressFn = (stage: string, fraction: number) => void;

const N_P2 = PHASE2_MOVES.length;

/** Inverse of each move's edge permutation: invEp[m][s] = where piece at s goes. */
const INV_EP: Uint8Array[] = MOVE_CUBES.map((mc) => {
  const inv = new Uint8Array(12);
  for (let i = 0; i < 12; i++) inv[mc.ep[i]] = i;
  return inv;
});

/* =============================================================== moves === */

function buildTwistMove(): Uint16Array {
  const t = new Uint16Array(N_TWIST * N_MOVES);
  const co = new Uint8Array(8);
  const nc = new Uint8Array(8);
  for (let x = 0; x < N_TWIST; x++) {
    setTwist(co, x);
    for (let m = 0; m < N_MOVES; m++) {
      const mc = MOVE_CUBES[m];
      for (let i = 0; i < 8; i++) nc[i] = (co[mc.cp[i]] + mc.co[i]) % 3;
      let v = 0;
      for (let i = 0; i < 7; i++) v = 3 * v + nc[i];
      t[x * N_MOVES + m] = v;
    }
  }
  return t;
}

function buildFlipMove(): Uint16Array {
  const t = new Uint16Array(N_FLIP * N_MOVES);
  const eo = new Uint8Array(12);
  const ne = new Uint8Array(12);
  for (let x = 0; x < N_FLIP; x++) {
    setFlip(eo, x);
    for (let m = 0; m < N_MOVES; m++) {
      const mc = MOVE_CUBES[m];
      for (let i = 0; i < 12; i++) ne[i] = (eo[mc.ep[i]] + mc.eo[i]) & 1;
      let v = 0;
      for (let i = 0; i < 11; i++) v = 2 * v + ne[i];
      t[x * N_MOVES + m] = v;
    }
  }
  return t;
}

function buildSliceMove(): Uint16Array {
  const t = new Uint16Array(N_SLICE * N_MOVES);
  const ep = new Uint8Array(12);
  const ne = new Uint8Array(12);
  for (let x = 0; x < N_SLICE; x++) {
    setSlice(ep, x);
    for (let m = 0; m < N_MOVES; m++) {
      const mc = MOVE_CUBES[m];
      for (let i = 0; i < 12; i++) ne[i] = ep[mc.ep[i]];
      t[x * N_MOVES + m] = sliceFromEp(ne);
    }
  }
  return t;
}

function buildCornerPermMove(): Uint16Array {
  const t = new Uint16Array(N_CORNER_PERM * N_MOVES);
  const cp = new Uint8Array(8);
  const nc = new Uint8Array(8);
  for (let x = 0; x < N_CORNER_PERM; x++) {
    indexToPerm(x, 8, cp);
    for (let m = 0; m < N_MOVES; m++) {
      const mc = MOVE_CUBES[m];
      for (let i = 0; i < 8; i++) nc[i] = cp[mc.cp[i]];
      t[x * N_MOVES + m] = permToIndex(nc, 8);
    }
  }
  return t;
}

function buildEdge8PermMove(): Uint16Array {
  const t = new Uint16Array(N_EDGE8_PERM * N_P2);
  const ep = new Uint8Array(12);
  const ne = new Uint8Array(12);
  for (let x = 0; x < N_EDGE8_PERM; x++) {
    indexToPerm(x, 8, ep.subarray(0, 8));
    for (let i = 8; i < 12; i++) ep[i] = i;
    for (let j = 0; j < N_P2; j++) {
      const mc = MOVE_CUBES[PHASE2_MOVES[j]];
      for (let i = 0; i < 12; i++) ne[i] = ep[mc.ep[i]];
      t[x * N_P2 + j] = permToIndex(ne.subarray(0, 8), 8);
    }
  }
  return t;
}

function buildSlicePermMove(): Uint8Array {
  const t = new Uint8Array(N_SLICE_PERM * N_P2);
  const ep = new Uint8Array(12);
  const ne = new Uint8Array(12);
  for (let x = 0; x < N_SLICE_PERM; x++) {
    for (let i = 0; i < 8; i++) ep[i] = i;
    setSlicePerm(ep, x);
    for (let j = 0; j < N_P2; j++) {
      const mc = MOVE_CUBES[PHASE2_MOVES[j]];
      for (let i = 0; i < 12; i++) ne[i] = ep[mc.ep[i]];
      t[x * N_P2 + j] = slicePermFromEp(ne);
    }
  }
  return t;
}

function buildCornerPermMoveP2(full: Uint16Array): Uint16Array {
  const t = new Uint16Array(N_CORNER_PERM * N_P2);
  for (let x = 0; x < N_CORNER_PERM; x++) {
    for (let j = 0; j < N_P2; j++) t[x * N_P2 + j] = full[x * N_MOVES + PHASE2_MOVES[j]];
  }
  return t;
}

/* ============================================================ pruning === */

/**
 * Breadth-first search over a product coordinate (a, b), flooding outwards
 * from the solved value. `table[a * sizeB + b]` ends up holding the exact
 * number of moves needed to make both coordinates solved simultaneously, in
 * the simplified world where nothing else about the cube is tracked.
 */
function bfsProduct(
  sizeA: number, sizeB: number,
  moveA: Uint16Array, moveB: Uint16Array | Uint8Array,
  nMoves: number, goalA: number, goalB: number,
): Uint8Array {
  const total = sizeA * sizeB;
  const table = new Uint8Array(total).fill(255);
  table[goalA * sizeB + goalB] = 0;
  let depth = 0;
  let filled = 1;
  while (filled < total) {
    let added = 0;
    const next = depth + 1;
    for (let idx = 0; idx < total; idx++) {
      if (table[idx] !== depth) continue;
      const a = (idx / sizeB) | 0;
      const b = idx - a * sizeB;
      const ra = a * nMoves;
      const rb = b * nMoves;
      for (let m = 0; m < nMoves; m++) {
        const j = moveA[ra + m] * sizeB + moveB[rb + m];
        if (table[j] === 255) { table[j] = next; added++; }
      }
    }
    if (added === 0) break; // the rest of the index space is unreachable
    filled += added;
    depth = next;
  }
  return table;
}

function bfsSingle(size: number, move: Uint16Array, nMoves: number, goal: number): Uint8Array {
  const table = new Uint8Array(size).fill(255);
  table[goal] = 0;
  let depth = 0;
  for (;;) {
    let added = 0;
    const next = depth + 1;
    for (let x = 0; x < size; x++) {
      if (table[x] !== depth) continue;
      const row = x * nMoves;
      for (let m = 0; m < nMoves; m++) {
        const j = move[row + m];
        if (table[j] === 255) { table[j] = next; added++; }
      }
    }
    if (added === 0) return table;
    depth = next;
  }
}

/* ==================================================== core table bundle === */

export interface CoreTables {
  twistMove: Uint16Array;
  flipMove: Uint16Array;
  sliceMove: Uint16Array;
  cornerPermMove: Uint16Array;
  cornerPermMoveP2: Uint16Array;
  edge8PermMove: Uint16Array;
  slicePermMove: Uint8Array;
  pruneTwistSlice: Uint8Array;  // phase 1
  pruneFlipSlice: Uint8Array;   // phase 1
  pruneFlipTwist: Uint8Array;   // phase 1
  pruneP2Corner: Uint8Array;    // phase 2
  pruneP2Edge: Uint8Array;      // phase 2
  /** Best phase-2 corner distance over every possible slice ordering. */
  minP2CornerOverSlice: Uint8Array;
  bytes: number;
}

let corePromise: Promise<CoreTables> | null = null;
let coreTables: CoreTables | null = null;

export function getCoreTablesSync(): CoreTables | null {
  return coreTables;
}

export function buildCoreTables(progress?: ProgressFn): CoreTables {
  if (coreTables) return coreTables;
  const p = progress ?? (() => {});
  p('move tables: corner twist', 0.02);
  const twistMove = buildTwistMove();
  p('move tables: edge flip', 0.08);
  const flipMove = buildFlipMove();
  p('move tables: middle slice', 0.12);
  const sliceMove = buildSliceMove();
  p('move tables: corner permutation', 0.18);
  const cornerPermMove = buildCornerPermMove();
  const cornerPermMoveP2 = buildCornerPermMoveP2(cornerPermMove);
  p('move tables: edge permutation', 0.34);
  const edge8PermMove = buildEdge8PermMove();
  const slicePermMove = buildSlicePermMove();

  p('distance table: twist x slice', 0.48);
  const pruneTwistSlice = bfsProduct(N_SLICE, N_TWIST, sliceMove, twistMove, N_MOVES, 0, 0);
  p('distance table: flip x slice', 0.64);
  const pruneFlipSlice = bfsProduct(N_SLICE, N_FLIP, sliceMove, flipMove, N_MOVES, 0, 0);
  p('distance table: flip x twist', 0.72);
  const pruneFlipTwist = bfsProduct(N_FLIP, N_TWIST, flipMove, twistMove, N_MOVES, 0, 0);
  p('distance table: phase 2 corners', 0.84);
  const pruneP2Corner = bfsProduct(N_SLICE_PERM, N_CORNER_PERM, sliceToU16(slicePermMove), cornerPermMoveP2, N_P2, 0, 0);
  p('distance table: phase 2 edges', 0.92);
  const pruneP2Edge = bfsProduct(N_SLICE_PERM, N_EDGE8_PERM, sliceToU16(slicePermMove), edge8PermMove, N_P2, 0, 0);
  const minP2CornerOverSlice = new Uint8Array(N_CORNER_PERM).fill(255);
  for (let sp = 0; sp < N_SLICE_PERM; sp++) {
    const base = sp * N_CORNER_PERM;
    for (let cp = 0; cp < N_CORNER_PERM; cp++) {
      const v = pruneP2Corner[base + cp];
      if (v < minP2CornerOverSlice[cp]) minP2CornerOverSlice[cp] = v;
    }
  }
  p('ready', 1);

  coreTables = {
    twistMove, flipMove, sliceMove, cornerPermMove, cornerPermMoveP2,
    edge8PermMove, slicePermMove,
    pruneTwistSlice, pruneFlipSlice, pruneFlipTwist, pruneP2Corner, pruneP2Edge,
    minP2CornerOverSlice,
    bytes: twistMove.byteLength + flipMove.byteLength + sliceMove.byteLength
      + cornerPermMove.byteLength + cornerPermMoveP2.byteLength + edge8PermMove.byteLength
      + slicePermMove.byteLength + pruneTwistSlice.byteLength + pruneFlipSlice.byteLength
      + pruneFlipTwist.byteLength + pruneP2Corner.byteLength + pruneP2Edge.byteLength
      + minP2CornerOverSlice.byteLength,
  };
  corePromise = Promise.resolve(coreTables);
  return coreTables;
}

function sliceToU16(a: Uint8Array): Uint16Array {
  const out = new Uint16Array(a.length);
  out.set(a);
  return out;
}

export function coreTablesReady(): Promise<CoreTables> {
  if (!corePromise) corePromise = Promise.resolve(buildCoreTables());
  return corePromise;
}

/* ============================================ optimal-search extra DBs === */

export interface OptimalTables {
  edge5ArrMove: Int32Array;
  edge5FlipMask: Uint8Array;
  /** Edges UR UF UL UB DR tracked with position and flip. */
  pdbEdgeA: Uint8Array;
  /** Edges DF DL DB FR FL tracked with position and flip. */
  pdbEdgeB: Uint8Array;
  /** Exact distance for corner permutation alone. */
  pdbCornerPerm: Uint8Array;
  /** Arrangement index of each tracked edge set when solved. */
  solvedArrA: number;
  solvedArrB: number;
  bytes: number;
}

let optimalTables: OptimalTables | null = null;

function buildEdge5MoveTables(): { arr: Int32Array; mask: Uint8Array } {
  const arr = new Int32Array(N_EDGE5_ARRANGEMENT * N_MOVES);
  const mask = new Uint8Array(N_EDGE5_ARRANGEMENT * N_MOVES);
  const loc = new Uint8Array(5);
  const nloc = new Uint8Array(5);
  for (let x = 0; x < N_EDGE5_ARRANGEMENT; x++) {
    edge5Locations(x, loc);
    const row = x * N_MOVES;
    for (let m = 0; m < N_MOVES; m++) {
      const inv = INV_EP[m];
      const eo = MOVE_CUBES[m].eo;
      let bits = 0;
      for (let k = 0; k < 5; k++) {
        const to = inv[loc[k]];
        nloc[k] = to;
        if (eo[to]) bits |= 1 << k;
      }
      arr[row + m] = edge5Arrangement(nloc);
      mask[row + m] = bits;
    }
  }
  return { arr, mask };
}

/**
 * Pattern database for five named edges. The stored number is the exact
 * minimum number of face turns that would bring those five edges home
 * (position and flip), ignoring the other fifteen pieces entirely.
 */
function buildEdge5Pdb(pieces: number[], arr: Int32Array, mask: Uint8Array): Uint8Array {
  const table = new Uint8Array(N_EDGE5).fill(255);
  const goalArr = edge5Arrangement(Uint8Array.from(pieces));
  table[goalArr * 32] = 0;
  let depth = 0;
  for (;;) {
    let added = 0;
    const next = depth + 1;
    for (let idx = 0; idx < N_EDGE5; idx++) {
      if (table[idx] !== depth) continue;
      const a = (idx / 32) | 0;
      const o = idx & 31;
      const row = a * N_MOVES;
      for (let m = 0; m < N_MOVES; m++) {
        const j = arr[row + m] * 32 + (o ^ mask[row + m]);
        if (table[j] === 255) { table[j] = next; added++; }
      }
    }
    if (added === 0) return table;
    depth = next;
  }
}

export function buildOptimalTables(progress?: ProgressFn): OptimalTables {
  if (optimalTables) return optimalTables;
  const core = buildCoreTables();
  const p = progress ?? (() => {});
  p('edge tracking tables', 0.05);
  const { arr, mask } = buildEdge5MoveTables();
  p('pattern database: five U/D edges', 0.3);
  const pdbEdgeA = buildEdge5Pdb([0, 1, 2, 3, 4], arr, mask);
  p('pattern database: five lower edges', 0.65);
  const pdbEdgeB = buildEdge5Pdb([5, 6, 7, 8, 9], arr, mask);
  p('pattern database: corner permutation', 0.95);
  const pdbCornerPerm = bfsSingle(N_CORNER_PERM, core.cornerPermMove, N_MOVES, 0);
  p('ready', 1);
  optimalTables = {
    edge5ArrMove: arr, edge5FlipMask: mask, pdbEdgeA, pdbEdgeB, pdbCornerPerm,
    solvedArrA: edge5Arrangement(Uint8Array.from([0, 1, 2, 3, 4])),
    solvedArrB: edge5Arrangement(Uint8Array.from([5, 6, 7, 8, 9])),
    bytes: arr.byteLength + mask.byteLength + pdbEdgeA.byteLength + pdbEdgeB.byteLength + pdbCornerPerm.byteLength,
  };
  return optimalTables;
}

export function getOptimalTablesSync(): OptimalTables | null {
  return optimalTables;
}

/** Maximum entry of a distance table - i.e. the diameter of that sub-problem. */
export function tableDiameter(t: Uint8Array): number {
  let max = 0;
  for (let i = 0; i < t.length; i++) if (t[i] !== 255 && t[i] > max) max = t[i];
  return max;
}

/** Histogram of a distance table, for the lesson visualisations. */
export function tableHistogram(t: Uint8Array): number[] {
  const h: number[] = [];
  for (let i = 0; i < t.length; i++) {
    const v = t[i];
    if (v === 255) continue;
    h[v] = (h[v] ?? 0) + 1;
  }
  for (let i = 0; i < h.length; i++) if (h[i] === undefined) h[i] = 0;
  return h;
}
