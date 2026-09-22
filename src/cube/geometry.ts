/**
 * Where every sticker actually is in space.
 *
 * The 3D renderer needs this, and so does the solver: knowing the geometry
 * lets us derive whole-cube rotations exactly instead of hand-typing tables.
 * Axes are x to the right (R), y up (U), z towards the viewer (F).
 */

import { CORNER_FACELET, EDGE_FACELET, FACE_NAMES } from './defs';

export type Vec3 = readonly [number, number, number];

/** Outward normal of each face, indexed U R F D L B. */
export const FACE_NORMAL: readonly Vec3[] = [
  [0, 1, 0],   // U
  [1, 0, 0],   // R
  [0, 0, 1],   // F
  [0, -1, 0],  // D
  [-1, 0, 0],  // L
  [0, 0, -1],  // B
];

/**
 * Cubie coordinate of facelet `i`, each component in {-1, 0, 1}. Row 0 of a
 * face is its top row and column 0 its left column, as seen looking straight
 * at that face from outside with U upwards (and, for U and D, with B and F
 * upwards respectively).
 */
export function faceletPosition(index: number): Vec3 {
  const face = Math.floor(index / 9);
  const k = index % 9;
  const r = Math.floor(k / 3);
  const c = k % 3;
  switch (face) {
    case 0: return [c - 1, 1, r - 1];    // U
    case 1: return [1, 1 - r, 1 - c];    // R
    case 2: return [c - 1, 1 - r, 1];    // F
    case 3: return [c - 1, -1, 1 - r];   // D
    case 4: return [-1, 1 - r, c - 1];   // L
    default: return [1 - c, 1 - r, -1];  // B
  }
}

export function faceletNormal(index: number): Vec3 {
  return FACE_NORMAL[Math.floor(index / 9)];
}

const POSITIONS: Vec3[] = Array.from({ length: 54 }, (_, i) => faceletPosition(i));

/** Find the facelet sitting at a given cubie coordinate and facing direction. */
export function faceletAt(pos: Vec3, normal: Vec3): number {
  const face = FACE_NORMAL.findIndex((n) => n[0] === normal[0] && n[1] === normal[1] && n[2] === normal[2]);
  if (face < 0) return -1;
  for (let i = face * 9; i < face * 9 + 9; i++) {
    const p = POSITIONS[i];
    if (p[0] === pos[0] && p[1] === pos[1] && p[2] === pos[2]) return i;
  }
  return -1;
}

/* ------------------------------------------------------------- dragging --- */

/**
 * The face turn a drag across a sticker means.
 *
 * `normal` is the outward normal of the sticker under the pointer and `pos`
 * its cubie coordinate. The drag is given as the world axis the sticker is
 * being pulled along (0, 1 or 2 for x, y, z) and which way along it. The
 * renderer works those two out from the camera; everything after that is cube
 * algebra with no view in it, which is why it lives here and can be checked
 * against the engine's own move tables rather than by eye in a browser.
 *
 * Returns a move index, or -1 when the drag names no face turn: along the
 * sticker's own normal, or across a middle slice, which no face turn moves.
 */
export function dragMove(
  normal: Vec3, pos: Vec3, alongAxis: number, alongSign: number,
): number {
  const normalAxis = normal.findIndex((c) => c !== 0);
  if (normalAxis < 0 || alongAxis < 0 || alongAxis > 2) return -1;
  if (alongAxis === normalAxis) return -1;
  // Three axes, two spoken for: the turn is about whichever is left.
  const turnAxis = 3 - normalAxis - alongAxis;
  const coord = pos[turnAxis];
  if (coord === 0) return -1;

  const faceNormal: Vec3 = [
    turnAxis === 0 ? coord : 0,
    turnAxis === 1 ? coord : 0,
    turnAxis === 2 ? coord : 0,
  ];
  const face = FACE_NORMAL.findIndex(
    (f) => f[0] === faceNormal[0] && f[1] === faceNormal[1] && f[2] === faceNormal[2],
  );
  if (face < 0) return -1;

  /*
   * Clockwise, seen from outside a face, is a *negative* rotation about that
   * face's outward normal, so a clockwise turn carries a sticker at `pos` in
   * the direction (-faceNormal) x pos. Asking which way that points settles
   * the direction outright. The version this replaced instead multiplied four
   * hand-derived signs together, two of which were the same sign written
   * twice: they cancelled, and every drag on the U, R or F layers turned the
   * wrong way while D, L and B turned the right way.
   */
  const w: Vec3 = [-faceNormal[0], -faceNormal[1], -faceNormal[2]];
  const carried = [
    w[1] * pos[2] - w[2] * pos[1],
    w[2] * pos[0] - w[0] * pos[2],
    w[0] * pos[1] - w[1] * pos[0],
  ][alongAxis];
  const power = Math.sign(carried) === Math.sign(alongSign) ? 1 : 3;
  return face * 3 + (power - 1);
}

/* ------------------------------------------------------------ rotations --- */

export type Mat3 = (v: Vec3) => Vec3;

/** A quarter turn of the whole cube, in the same direction as the named move. */
export const ROT_X: Mat3 = ([x, y, z]) => [x, z, -y];
export const ROT_Y: Mat3 = ([x, y, z]) => [-z, y, x];
export const ROT_Z: Mat3 = ([x, y, z]) => [y, -x, z];

export function composeRot(a: Mat3, b: Mat3): Mat3 {
  return (v) => b(a(v));
}

export function rotPower(r: Mat3, n: number): Mat3 {
  let out: Mat3 = (v) => v;
  for (let i = 0; i < n; i++) out = composeRot(out, r);
  return out;
}

export interface Reorientation {
  name: string;
  /** Where each face ends up: facePerm[f] is the new face of old face f. */
  facePerm: number[];
  /** Where each facelet ends up. */
  faceletPerm: number[];
}

export function reorientation(name: string, rot: Mat3): Reorientation {
  const facePerm = FACE_NORMAL.map((n) => {
    const m = rot(n);
    return FACE_NORMAL.findIndex((q) => q[0] === m[0] && q[1] === m[1] && q[2] === m[2]);
  });
  const faceletPerm = new Array(54);
  for (let i = 0; i < 54; i++) {
    faceletPerm[i] = faceletAt(rot(POSITIONS[i]), rot(faceletNormal(i)));
  }
  return { name, facePerm, faceletPerm };
}

export const IDENTITY_REORIENTATION: Reorientation = reorientation('identity', (v) => v);

/**
 * Apply a whole-cube rotation to a sticker layout.
 *
 * Physically nothing about the puzzle changes - we are just holding it a
 * different way round. Every sticker moves to a new slot, and because the
 * centres moved too, every colour gets renamed. That is what makes this a
 * *relabelling* of the cube group rather than an element of it, and it is why
 * the two-phase solver can try three different "up" axes for free.
 */
export function reorientFacelets(f: Uint8Array, r: Reorientation): Uint8Array {
  const out = new Uint8Array(54);
  for (let i = 0; i < 54; i++) out[r.faceletPerm[i]] = r.facePerm[f[i]];
  return out;
}

export function invertFacePerm(facePerm: number[]): number[] {
  const inv = new Array(6);
  for (let i = 0; i < 6; i++) inv[facePerm[i]] = i;
  return inv;
}

/** Sanity data for tests and lessons: the three facelets of each corner slot. */
export function describeSlotGeometry(): string[] {
  const lines: string[] = [];
  CORNER_FACELET.forEach((t, i) => {
    lines.push(`corner ${i}: ${t.map((x) => `${FACE_NAMES[Math.floor(x / 9)]}${(x % 9) + 1}`).join(' ')}`);
  });
  EDGE_FACELET.forEach((t, i) => {
    lines.push(`edge ${i}: ${t.map((x) => `${FACE_NAMES[Math.floor(x / 9)]}${(x % 9) + 1}`).join(' ')}`);
  });
  return lines;
}
