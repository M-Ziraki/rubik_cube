/**
 * Coordinates: small integers that capture exactly one aspect of a cube state.
 *
 * A coordinate is a projection of the 4.3x10^19 states onto something small
 * enough to tabulate. Crucially the projection respects moves - if you know a
 * coordinate and a move you can look up the new coordinate without knowing the
 * full state. That is what makes lookup tables, and therefore fast search,
 * possible at all.
 */

import type { CubieState } from '../cube/cubie';
import { Cnk, indexToPartialPerm, indexToPerm, partialPermToIndex, permToIndex } from './permutil';

export const N_TWIST = 2187;   // 3^7 corner-orientation states
export const N_FLIP = 2048;    // 2^11 edge-orientation states
export const N_SLICE = 495;    // C(12,4) placements of the middle-slice edges
export const N_CORNER_PERM = 40320; // 8!
export const N_EDGE8_PERM = 40320;  // 8! permutations of the U/D-layer edges
export const N_SLICE_PERM = 24;     // 4! orders of the slice edges

/* ---------------------------------------------------------- orientation --- */

export function getTwist(c: CubieState): number {
  let t = 0;
  for (let i = 0; i < 7; i++) t = 3 * t + c.co[i];
  return t;
}

export function setTwist(co: Uint8Array, twist: number): void {
  let parity = 0;
  for (let i = 6; i >= 0; i--) {
    co[i] = twist % 3;
    parity += co[i];
    twist = Math.floor(twist / 3);
  }
  co[7] = (3 - (parity % 3)) % 3;
}

export function getFlip(c: CubieState): number {
  let f = 0;
  for (let i = 0; i < 11; i++) f = 2 * f + c.eo[i];
  return f;
}

export function setFlip(eo: Uint8Array, flip: number): void {
  let parity = 0;
  for (let i = 10; i >= 0; i--) {
    eo[i] = flip & 1;
    parity += eo[i];
    flip >>= 1;
  }
  eo[11] = parity & 1;
}

/* --------------------------------------------------------------- slice --- */

/**
 * Which four slots hold the four middle-slice edges (FR, FL, BL, BR), ignoring
 * their order. 0 means "all four are home", which is half of what phase 1 of
 * the two-phase algorithm is trying to achieve.
 */
export function getSlice(c: CubieState): number {
  return sliceFromEp(c.ep);
}

export function sliceFromEp(ep: ArrayLike<number>): number {
  let a = 0, x = 0;
  for (let j = 11; j >= 0; j--) {
    if (ep[j] >= 8) { a += Cnk(11 - j, x + 1); x++; }
  }
  return a;
}

export function setSlice(ep: Uint8Array, idx: number): void {
  const q = new Int32Array(4);
  let a = idx;
  for (let k = 4; k >= 1; k--) {
    let v = k - 1;
    while (Cnk(v + 1, k) <= a) v++;
    q[k - 1] = v;
    a -= Cnk(v, k);
  }
  const isSlice = new Uint8Array(12);
  for (let i = 0; i < 4; i++) isSlice[11 - q[i]] = 1;
  let sliceNext = 8, otherNext = 0;
  for (let j = 0; j < 12; j++) ep[j] = isSlice[j] ? sliceNext++ : otherNext++;
}

/* ---------------------------------------------------------- phase-two --- */

export function getCornerPerm(c: CubieState): number {
  return permToIndex(c.cp, 8);
}

export function setCornerPerm(cp: Uint8Array, idx: number): void {
  indexToPerm(idx, 8, cp);
}

/** Permutation of the eight U- and D-layer edges. Only meaningful inside G1. */
export function getEdge8Perm(c: CubieState): number {
  return permToIndex(c.ep.subarray(0, 8), 8);
}

export function setEdge8Perm(ep: Uint8Array, idx: number): void {
  const p = indexToPerm(idx, 8);
  for (let i = 0; i < 8; i++) ep[i] = p[i];
  for (let i = 8; i < 12; i++) ep[i] = i;
}

/** Order of the four slice edges within the slice. Only meaningful inside G1. */
export function getSlicePerm(c: CubieState): number {
  return slicePermFromEp(c.ep);
}

const SLICE_PERM_SCRATCH = new Uint8Array(4);
export function slicePermFromEp(ep: ArrayLike<number>): number {
  for (let i = 0; i < 4; i++) SLICE_PERM_SCRATCH[i] = ep[8 + i] - 8;
  return permToIndex(SLICE_PERM_SCRATCH, 4);
}

export function setSlicePerm(ep: Uint8Array, idx: number): void {
  const p = indexToPerm(idx, 4);
  for (let i = 0; i < 4; i++) ep[8 + i] = p[i] + 8;
}

/* ------------------------------------------- partial-edge pattern DBs --- */

export const N_EDGE5_ARRANGEMENT = 12 * 11 * 10 * 9 * 8; // 95,040
export const N_EDGE5_ORIENT = 32;
export const N_EDGE5 = N_EDGE5_ARRANGEMENT * N_EDGE5_ORIENT; // 3,041,280

export function edge5Arrangement(loc: ArrayLike<number>): number {
  return partialPermToIndex(loc, 5, 12);
}

export function edge5Locations(idx: number, out: Uint8Array): Uint8Array {
  return indexToPartialPerm(idx, 5, 12, out);
}

/** Is this cube inside the phase-2 subgroup G1 = <U, D, L2, R2, F2, B2>? */
export function isInG1(c: CubieState): boolean {
  return getTwist(c) === 0 && getFlip(c) === 0 && getSlice(c) === 0;
}
