/**
 * Conversion between the sticker view (54 facelets) and the cubie view, plus
 * the validation a real, physical cube has to pass.
 *
 * Validation matters more than it looks. Of the 54! ways to paint stickers on
 * a cube, only 43,252,003,274,489,856,000 correspond to a cube you could
 * actually reach by turning faces. The three laws below - corner twist,
 * edge flip and permutation parity - are exactly what cuts the naive count
 * down by a factor of 12, and they are also the first genuinely group-theoretic
 * fact a solver has to respect.
 */

import { CubieCube } from './cubie';
import {
  CORNER_COLOR, CORNER_FACELET, CORNER_NAMES, EDGE_COLOR, EDGE_FACELET, EDGE_NAMES,
  FACE_NAMES, SOLVED_FACELETS,
} from './defs';

export type Facelets = Uint8Array; // 54 entries, each 0..5 = U R F D L B

export class CubeError extends Error {
  readonly code: string;
  readonly detail: string[];
  constructor(code: string, message: string, detail: string[] = []) {
    super(message);
    this.code = code;
    this.detail = detail;
  }
}

export function parseFaceletString(s: string): Facelets {
  const cleaned = s.replace(/\s+/g, '').toUpperCase();
  if (cleaned.length !== 54) {
    throw new CubeError('length', `Expected 54 facelets, received ${cleaned.length}.`);
  }
  const out = new Uint8Array(54);
  for (let i = 0; i < 54; i++) {
    const idx = FACE_NAMES.indexOf(cleaned[i] as never);
    if (idx < 0) throw new CubeError('alphabet', `Facelet ${i + 1} is "${cleaned[i]}"; expected one of U R F D L B.`);
    out[i] = idx;
  }
  return out;
}

export function faceletString(f: Facelets): string {
  let s = '';
  for (let i = 0; i < 54; i++) s += FACE_NAMES[f[i]];
  return s;
}

export const SOLVED_FACELET_ARRAY = parseFaceletString(SOLVED_FACELETS);

/** Render a cubie state as 54 facelets. */
export function toFacelets(cube: CubieCube): Facelets {
  const f = new Uint8Array(54);
  for (let i = 0; i < 6; i++) f[i * 9 + 4] = i; // centres never move
  for (let i = 0; i < 8; i++) {
    const piece = cube.cp[i];
    const ori = cube.co[i];
    for (let n = 0; n < 3; n++) {
      f[CORNER_FACELET[i][(n + ori) % 3]] = CORNER_COLOR[piece][n];
    }
  }
  for (let i = 0; i < 12; i++) {
    const piece = cube.ep[i];
    const ori = cube.eo[i];
    for (let n = 0; n < 2; n++) {
      f[EDGE_FACELET[i][(n + ori) % 2]] = EDGE_COLOR[piece][n];
    }
  }
  return f;
}

export interface Diagnosis {
  ok: boolean;
  problems: CubeError[];
  /** Populated when the sticker layout is at least piece-wise coherent. */
  cube?: CubieCube;
}

/**
 * Turn 54 facelets into a cubie state, reporting every law that is broken
 * rather than stopping at the first one - a mis-scanned physical cube usually
 * breaks several at once and the user deserves to see them all.
 */
export function diagnose(f: Facelets): Diagnosis {
  const problems: CubeError[] = [];

  // Law 0: nine stickers of each colour.
  const counts = new Array(6).fill(0);
  for (let i = 0; i < 54; i++) counts[f[i]]++;
  const wrongCounts = counts
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c !== 9)
    .map(({ c, i }) => `${FACE_NAMES[i]}: ${c} (needs 9)`);
  if (wrongCounts.length) {
    problems.push(new CubeError('counts', 'Each colour must appear exactly nine times.', wrongCounts));
  }

  // Law 0b: the centres define the colour scheme and cannot be repainted.
  const badCentres: string[] = [];
  for (let i = 0; i < 6; i++) {
    if (f[i * 9 + 4] !== i) badCentres.push(`centre of ${FACE_NAMES[i]} reads ${FACE_NAMES[f[i * 9 + 4]]}`);
  }
  if (badCentres.length) {
    problems.push(new CubeError('centres', 'The six centre stickers fix the colour scheme and must stay put.', badCentres));
  }

  const cube = new CubieCube();
  cube.cp.fill(255); cube.ep.fill(255);

  // Corners: find which piece sits in each slot and how it is twisted.
  const cornerProblems: string[] = [];
  for (let i = 0; i < 8; i++) {
    let ori = 0;
    for (; ori < 3; ori++) {
      const col = f[CORNER_FACELET[i][ori]];
      if (col === 0 || col === 3) break; // a U or D sticker defines the twist
    }
    if (ori === 3) {
      cornerProblems.push(`${CORNER_NAMES[i]} has no white or yellow sticker`);
      continue;
    }
    const a = f[CORNER_FACELET[i][(ori + 1) % 3]];
    const b = f[CORNER_FACELET[i][(ori + 2) % 3]];
    let found = -1;
    for (let j = 0; j < 8; j++) {
      if (a === CORNER_COLOR[j][1] && b === CORNER_COLOR[j][2]) { found = j; break; }
    }
    if (found < 0) {
      cornerProblems.push(`${CORNER_NAMES[i]} shows a colour combination that no real corner has`);
      continue;
    }
    cube.cp[i] = found;
    cube.co[i] = ori;
  }

  // Edges.
  const edgeProblems: string[] = [];
  for (let i = 0; i < 12; i++) {
    let found = -1;
    let ori = 0;
    const a = f[EDGE_FACELET[i][0]];
    const b = f[EDGE_FACELET[i][1]];
    for (let j = 0; j < 12; j++) {
      if (a === EDGE_COLOR[j][0] && b === EDGE_COLOR[j][1]) { found = j; ori = 0; break; }
      if (a === EDGE_COLOR[j][1] && b === EDGE_COLOR[j][0]) { found = j; ori = 1; break; }
    }
    if (found < 0) {
      edgeProblems.push(`${EDGE_NAMES[i]} shows a colour combination that no real edge has`);
      continue;
    }
    cube.ep[i] = found;
    cube.eo[i] = ori;
  }
  if (cornerProblems.length) problems.push(new CubeError('corner-pieces', 'Some corner slots do not hold a real corner piece.', cornerProblems));
  if (edgeProblems.length) problems.push(new CubeError('edge-pieces', 'Some edge slots do not hold a real edge piece.', edgeProblems));

  if (problems.length) return { ok: false, problems };

  // Every piece must appear exactly once.
  const dupC: string[] = [];
  const seenC = new Array(8).fill(0);
  for (let i = 0; i < 8; i++) seenC[cube.cp[i]]++;
  for (let j = 0; j < 8; j++) {
    if (seenC[j] === 0) dupC.push(`${CORNER_NAMES[j]} is missing`);
    else if (seenC[j] > 1) dupC.push(`${CORNER_NAMES[j]} appears ${seenC[j]} times`);
  }
  const dupE: string[] = [];
  const seenE = new Array(12).fill(0);
  for (let i = 0; i < 12; i++) seenE[cube.ep[i]]++;
  for (let j = 0; j < 12; j++) {
    if (seenE[j] === 0) dupE.push(`${EDGE_NAMES[j]} is missing`);
    else if (seenE[j] > 1) dupE.push(`${EDGE_NAMES[j]} appears ${seenE[j]} times`);
  }
  if (dupC.length) problems.push(new CubeError('corner-duplicates', 'Each corner piece must appear exactly once.', dupC));
  if (dupE.length) problems.push(new CubeError('edge-duplicates', 'Each edge piece must appear exactly once.', dupE));
  if (problems.length) return { ok: false, problems };

  // Law 1: total corner twist is a multiple of three.
  let twist = 0;
  for (let i = 0; i < 8; i++) twist += cube.co[i];
  if (twist % 3 !== 0) {
    problems.push(new CubeError(
      'twist',
      'One corner is twisted in place. No sequence of face turns can do that.',
      [`Total twist is ${twist}, which is ${twist % 3} more than a multiple of 3. Rotate one corner ${3 - (twist % 3)} step(s).`],
    ));
  }

  // Law 2: an even number of edges are flipped.
  let flip = 0;
  for (let i = 0; i < 12; i++) flip += cube.eo[i];
  if (flip % 2 !== 0) {
    problems.push(new CubeError(
      'flip',
      'One edge is flipped in place. Face turns always flip edges in pairs.',
      [`${flip} edges read as flipped, which is odd. Flip one edge over.`],
    ));
  }

  // Law 3: corners and edges have matching permutation parity.
  const cParity = permutationParity(cube.cp);
  const eParity = permutationParity(cube.ep);
  if (cParity !== eParity) {
    problems.push(new CubeError(
      'parity',
      'Two pieces are swapped. Every face turn is a 4-cycle, so corner parity and edge parity always agree.',
      ['Swap any two corner pieces (or any two edge pieces) to fix it.'],
    ));
  }

  if (problems.length) return { ok: false, problems, cube };
  return { ok: true, problems: [], cube };
}

export function permutationParity(p: ArrayLike<number>): number {
  let parity = 0;
  for (let i = p.length - 1; i > 0; i--) {
    for (let j = i - 1; j >= 0; j--) {
      if (p[j] > p[i]) parity ^= 1;
    }
  }
  return parity;
}

/** Strict conversion: throws with the first problem found. */
export function fromFacelets(f: Facelets | string): CubieCube {
  const arr = typeof f === 'string' ? parseFaceletString(f) : f;
  const d = diagnose(arr);
  if (!d.ok || !d.cube) throw d.problems[0] ?? new CubeError('unknown', 'Unrecognisable cube state.');
  return d.cube;
}
