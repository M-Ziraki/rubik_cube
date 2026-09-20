/**
 * The 2x2x2 cube, solved completely and exhaustively.
 *
 * This is the centrepiece of the graph lessons. The 3x3x3 has 4.3x10^19 states
 * and nobody will ever hold its graph in a computer. Its little brother has
 * only 3,674,160 - small enough to enumerate every single one in a fraction of
 * a second, right here in the browser.
 *
 * Once you have the full distance table you have everything: the exact number
 * of states at every distance, a provably shortest solution for any position,
 * and a *proof* of God's number for this puzzle, obtained the same way
 * Rokicki and colleagues obtained it for the 3x3x3 in 2010 - by checking
 * every case, just with 10^13 times less work.
 *
 * Convention: the DBL corner is held still, so only U, R and F are needed;
 * turning the other three faces would just be the same positions seen from a
 * different angle.
 */

import { CubieCube, MOVE_CUBES } from '../cube/cubie';
import { CORNER_COLOR, CORNER_FACELET, MOVE_FACE, MOVE_NAMES } from '../cube/defs';
import { indexToPerm, permToIndex } from './permutil';

/** The seven mobile corners, in the order used for the pocket-cube index. */
export const POCKET_SLOTS = [0, 1, 2, 3, 4, 5, 7]; // URF UFL ULB UBR DFR DLF DRB
export const POCKET_MOVES = [0, 1, 2, 3, 4, 5, 6, 7, 8]; // U U2 U' R R2 R' F F2 F'
export const N_POCKET_PERM = 5040;   // 7!
export const N_POCKET_TWIST = 729;   // 3^6
export const N_POCKET = N_POCKET_PERM * N_POCKET_TWIST; // 3,674,160

export interface PocketTables {
  permMove: Uint16Array;      // [perm * 9 + move]
  twistMove: Uint16Array;     // [twist * 9 + move]
  distance: Uint8Array;       // exact distance to solved for every state
  histogram: number[];        // how many states lie at each distance
  godsNumber: number;
  millis: number;
}

let pocket: PocketTables | null = null;

function slotOf(cornerIndex: number): number {
  return POCKET_SLOTS.indexOf(cornerIndex);
}

function encodeTwist(o: ArrayLike<number>): number {
  let v = 0;
  for (let i = 0; i < 6; i++) v = v * 3 + o[i];
  return v;
}

function decodeTwist(v: number, out: Uint8Array): Uint8Array {
  let sum = 0;
  for (let i = 5; i >= 0; i--) { out[i] = v % 3; sum += out[i]; v = (v / 3) | 0; }
  out[6] = (3 - (sum % 3)) % 3;
  return out;
}

export function buildPocketTables(): PocketTables {
  if (pocket) return pocket;
  const t0 = Date.now();
  const nm = POCKET_MOVES.length;

  // How each move rearranges the seven slots, and how much it twists each one.
  const slotSource: number[][] = [];
  const slotTwist: number[][] = [];
  for (const m of POCKET_MOVES) {
    const mc = MOVE_CUBES[m];
    const src: number[] = [], tw: number[] = [];
    for (let k = 0; k < 7; k++) {
      const corner = POCKET_SLOTS[k];
      src.push(slotOf(mc.cp[corner]));
      tw.push(mc.co[corner]);
    }
    slotSource.push(src);
    slotTwist.push(tw);
  }

  const permMove = new Uint16Array(N_POCKET_PERM * nm);
  const p = new Uint8Array(7), np = new Uint8Array(7);
  for (let x = 0; x < N_POCKET_PERM; x++) {
    indexToPerm(x, 7, p);
    for (let m = 0; m < nm; m++) {
      for (let k = 0; k < 7; k++) np[k] = p[slotSource[m][k]];
      permMove[x * nm + m] = permToIndex(np, 7);
    }
  }

  const twistMove = new Uint16Array(N_POCKET_TWIST * nm);
  const o = new Uint8Array(7), no = new Uint8Array(7);
  for (let x = 0; x < N_POCKET_TWIST; x++) {
    decodeTwist(x, o);
    for (let m = 0; m < nm; m++) {
      for (let k = 0; k < 7; k++) no[k] = (o[slotSource[m][k]] + slotTwist[m][k]) % 3;
      twistMove[x * nm + m] = encodeTwist(no);
    }
  }

  // Breadth-first search over every single state.
  const distance = new Uint8Array(N_POCKET).fill(255);
  distance[0] = 0;
  const histogram: number[] = [1];
  let depth = 0;
  let seen = 1;
  while (seen < N_POCKET) {
    let added = 0;
    const next = depth + 1;
    for (let idx = 0; idx < N_POCKET; idx++) {
      if (distance[idx] !== depth) continue;
      const perm = (idx / N_POCKET_TWIST) | 0;
      const twist = idx - perm * N_POCKET_TWIST;
      const rp = perm * nm, rt = twist * nm;
      for (let m = 0; m < nm; m++) {
        const j = permMove[rp + m] * N_POCKET_TWIST + twistMove[rt + m];
        if (distance[j] === 255) { distance[j] = next; added++; }
      }
    }
    if (added === 0) break;
    histogram.push(added);
    seen += added;
    depth = next;
  }

  pocket = {
    permMove, twistMove, distance, histogram,
    godsNumber: histogram.length - 1,
    millis: Date.now() - t0,
  };
  return pocket;
}

export function getPocketTablesSync(): PocketTables | null {
  return pocket;
}

export function pocketIndex(perm: number, twist: number): number {
  return perm * N_POCKET_TWIST + twist;
}

export function pocketSolvedIndex(): number {
  return 0;
}

/**
 * Project a full 3x3x3 state onto its corners. Only meaningful when the DBL
 * corner is home and untwisted, which is true for anything built out of U, R
 * and F turns.
 */
export function pocketFromCube(c: CubieCube): number | null {
  if (c.cp[6] !== 6 || c.co[6] !== 0) return null;
  const p = new Uint8Array(7), o = new Uint8Array(7);
  for (let k = 0; k < 7; k++) {
    const slot = POCKET_SLOTS[k];
    const piece = slotOf(c.cp[slot]);
    if (piece < 0) return null;
    p[k] = piece;
    o[k] = c.co[slot];
  }
  return permToIndex(p, 7) * N_POCKET_TWIST + encodeTwist(o);
}

export function pocketApply(idx: number, move: number, T = buildPocketTables()): number {
  const nm = POCKET_MOVES.length;
  const perm = (idx / N_POCKET_TWIST) | 0;
  const twist = idx - perm * N_POCKET_TWIST;
  return T.permMove[perm * nm + move] * N_POCKET_TWIST + T.twistMove[twist * nm + move];
}

/**
 * A provably shortest solution, read straight out of the distance table: from
 * any state, step to any neighbour whose distance is one smaller. No search,
 * no heuristics, no doubt.
 */
export function solvePocket(idx: number, T = buildPocketTables()): number[] {
  const out: number[] = [];
  let cur = idx;
  let guard = 0;
  while (T.distance[cur] > 0 && guard++ < 64) {
    const want = T.distance[cur] - 1;
    for (let m = 0; m < POCKET_MOVES.length; m++) {
      const j = pocketApply(cur, m, T);
      if (T.distance[j] === want) { out.push(POCKET_MOVES[m]); cur = j; break; }
    }
  }
  return out;
}

/** Every shortest first move from a state - the branches of an optimal path. */
export function pocketOptimalMoves(idx: number, T = buildPocketTables()): number[] {
  const want = T.distance[idx] - 1;
  const out: number[] = [];
  for (let m = 0; m < POCKET_MOVES.length; m++) {
    if (T.distance[pocketApply(idx, m, T)] === want) out.push(POCKET_MOVES[m]);
  }
  return out;
}

export function pocketScramble(depth: number, rng: () => number = Math.random, T = buildPocketTables()): { index: number; moves: number[] } {
  let idx = 0;
  const moves: number[] = [];
  let prevFace = -1;
  let guard = 0;
  while (moves.length < depth && guard++ < 500) {
    const m = Math.floor(rng() * POCKET_MOVES.length);
    if (MOVE_FACE[POCKET_MOVES[m]] === prevFace) continue;
    idx = pocketApply(idx, m, T);
    moves.push(POCKET_MOVES[m]);
    prevFace = MOVE_FACE[POCKET_MOVES[m]];
  }
  return { index: idx, moves };
}

/** Pick a uniformly random state at an exact distance from solved. */
export function pocketRandomAtDistance(d: number, rng: () => number = Math.random, T = buildPocketTables()): number {
  const count = T.histogram[d] ?? 0;
  if (!count) return 0;
  let target = Math.floor(rng() * count);
  for (let i = 0; i < N_POCKET; i++) {
    if (T.distance[i] === d && target-- === 0) return i;
  }
  return 0;
}

/**
 * The 24 stickers of the 2x2x2, as face indices, ordered face by face and
 * then top-left, top-right, bottom-left, bottom-right.
 */
export function pocketStickers(idx: number): Uint8Array {
  const perm = (idx / N_POCKET_TWIST) | 0;
  const twist = idx - perm * N_POCKET_TWIST;
  const p = indexToPerm(perm, 7);
  const o = new Uint8Array(7);
  let sum = 0;
  let v = twist;
  for (let i = 5; i >= 0; i--) { o[i] = v % 3; sum += o[i]; v = (v / 3) | 0; }
  o[6] = (3 - (sum % 3)) % 3;

  const cp = new Uint8Array(8);
  const co = new Uint8Array(8);
  cp[6] = 6; co[6] = 0;
  for (let k = 0; k < 7; k++) {
    cp[POCKET_SLOTS[k]] = POCKET_SLOTS[p[k]];
    co[POCKET_SLOTS[k]] = o[k];
  }

  const f = new Uint8Array(54);
  for (let i = 0; i < 8; i++) {
    const piece = cp[i];
    const ori = co[i];
    for (let n = 0; n < 3; n++) f[CORNER_FACELET[i][(n + ori) % 3]] = CORNER_COLOR[piece][n];
  }
  const out = new Uint8Array(24);
  for (let face = 0; face < 6; face++) {
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 2; c++) out[face * 4 + r * 2 + c] = f[face * 9 + r * 6 + c * 2];
    }
  }
  return out;
}

export function pocketMoveName(move: number): string {
  return MOVE_NAMES[POCKET_MOVES[move]];
}
