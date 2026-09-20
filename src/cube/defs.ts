/**
 * Core vocabulary of the 3x3x3 cube.
 *
 * Two representations are used throughout the app and it is worth being precise
 * about the difference, because half of the mathematics in the lessons depends
 * on it:
 *
 *   - The *facelet* representation is what your eyes see: 54 coloured stickers.
 *     It is how a human describes a physical cube, and it is redundant.
 *   - The *cubie* representation is what the group theory sees: 8 corner pieces
 *     and 12 edge pieces, each with a position (permutation) and a twist or
 *     flip (orientation). It is the representation in which "a move" is a
 *     group element and "solving" is a walk on a Cayley graph.
 *
 * Piece and facelet numbering follows Herbert Kociemba's conventions so that
 * the solver tables below match the published literature.
 */

/** The six faces, in the canonical order U R F D L B. */
export const FACE_NAMES = ['U', 'R', 'F', 'D', 'L', 'B'] as const;
export type FaceName = (typeof FACE_NAMES)[number];

export const U = 0, R = 1, F = 2, D = 3, L = 4, B = 5;

/** Corner pieces. Letters read clockwise as seen from outside the cube. */
export const CORNER_NAMES = ['URF', 'UFL', 'ULB', 'UBR', 'DFR', 'DLF', 'DBL', 'DRB'] as const;
/** Edge pieces. */
export const EDGE_NAMES = ['UR', 'UF', 'UL', 'UB', 'DR', 'DF', 'DL', 'DB', 'FR', 'FL', 'BL', 'BR'] as const;

export type CornerName = (typeof CORNER_NAMES)[number];
export type EdgeName = (typeof EDGE_NAMES)[number];

/**
 * Facelet indices 0..53 laid out U0..U8, R9..R17, F18..F26, D27..D35,
 * L36..L44, B45..B53. Within a face the stickers are numbered left-to-right,
 * top-to-bottom as seen when that face is turned towards you with the standard
 * orientation (U on top for the side faces, B behind).
 */
export const FACELETS_PER_FACE = 9;

/** The three facelets of each corner slot, listed clockwise. */
export const CORNER_FACELET: readonly (readonly [number, number, number])[] = [
  [8, 9, 20],   // URF
  [6, 18, 38],  // UFL
  [0, 36, 47],  // ULB
  [2, 45, 11],  // UBR
  [29, 26, 15], // DFR
  [27, 44, 24], // DLF
  [33, 53, 42], // DBL
  [35, 17, 51], // DRB
];

/** The two facelets of each edge slot. */
export const EDGE_FACELET: readonly (readonly [number, number])[] = [
  [5, 10],  // UR
  [7, 19],  // UF
  [3, 37],  // UL
  [1, 46],  // UB
  [32, 16], // DR
  [28, 25], // DF
  [30, 43], // DL
  [34, 52], // DB
  [23, 12], // FR
  [21, 41], // FL
  [50, 39], // BL
  [48, 14], // BR
];

/** Face colour of each corner facelet on a solved cube. */
export const CORNER_COLOR: readonly (readonly [number, number, number])[] =
  CORNER_FACELET.map((t) => t.map((f) => Math.floor(f / 9)) as unknown as [number, number, number]);

/** Face colour of each edge facelet on a solved cube. */
export const EDGE_COLOR: readonly (readonly [number, number])[] =
  EDGE_FACELET.map((t) => t.map((f) => Math.floor(f / 9)) as unknown as [number, number]);

/** The 18 face-turn-metric moves. Index = face * 3 + (power - 1). */
export const MOVE_NAMES = [
  'U', 'U2', "U'",
  'R', 'R2', "R'",
  'F', 'F2', "F'",
  'D', 'D2', "D'",
  'L', 'L2', "L'",
  'B', 'B2', "B'",
] as const;
export type MoveName = (typeof MOVE_NAMES)[number];

export const N_MOVES = 18;

/** Face index (0..5) that a move index turns. */
export const MOVE_FACE: readonly number[] = MOVE_NAMES.map((_, i) => Math.floor(i / 3));
/** Quarter turns clockwise: 1, 2 or 3. */
export const MOVE_POWER: readonly number[] = MOVE_NAMES.map((_, i) => (i % 3) + 1);

/** The move that undoes a given move. */
export const MOVE_INVERSE: readonly number[] = MOVE_NAMES.map((_, i) => {
  const face = Math.floor(i / 3);
  const power = (i % 3) + 1;
  return face * 3 + (4 - power - 1);
});

/**
 * The ten moves of the phase-2 subgroup G1 = <U, D, L2, R2, F2, B2>, given as
 * indices into MOVE_NAMES. Every element of G1 keeps all edge orientations,
 * all corner orientations and the four middle-slice edges inside the slice.
 */
export const PHASE2_MOVES: readonly number[] = [0, 1, 2, 4, 9, 10, 11, 13, 7, 16];

/** Opposite face of each face: U<->D, R<->L, F<->B. */
export const OPPOSITE_FACE: readonly number[] = [3, 4, 5, 0, 1, 2];

/**
 * Should a move on `next` be skipped when the previous move turned `prev`?
 *
 * Two turns of the same face in a row are always redundant. Turns of opposite
 * faces commute, so we only allow them in one canonical order - that halves
 * the number of duplicate branches the search has to look at without losing
 * any solution.
 */
export function isRedundant(prevFace: number, nextFace: number): boolean {
  if (prevFace < 0) return false;
  if (prevFace === nextFace) return true;
  return OPPOSITE_FACE[prevFace] === nextFace && prevFace > nextFace;
}

/** Sticker palette, sampled to match the classic cube in the reference video. */
export const FACE_COLORS: Record<FaceName, string> = {
  U: '#fcfaf4', // white
  R: '#e2622c', // orange
  F: '#1c6b3f', // green
  D: '#e8b525', // yellow
  L: '#c2352c', // red
  B: '#1f4f96', // blue
};

export const FACE_COLOR_NAMES: Record<FaceName, string> = {
  U: 'white', R: 'orange', F: 'green', D: 'yellow', L: 'red', B: 'blue',
};

export const SOLVED_FACELETS = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';

/** Total number of reachable configurations: 8! * 3^7 * 12! * 2^11 / 2. */
export const CUBE_STATE_COUNT = 43252003274489856000n;

/** Proven maximum distance from any state to solved, in the face-turn metric. */
export const GODS_NUMBER = 20;
