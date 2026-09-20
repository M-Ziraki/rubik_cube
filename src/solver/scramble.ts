/**
 * Scramble generation.
 *
 * "Random moves" and "random state" are not the same thing, and the difference
 * is a nice lesson in its own right. Twenty-five random turns leaves you at a
 * position drawn from a distribution that is *not* uniform over the cube group.
 * A genuinely uniform scramble is built by sampling the permutations and
 * orientations directly, subject to the three physical laws.
 */

import { CubieCube } from '../cube/cubie';
import { N_MOVES, MOVE_FACE, isRedundant } from '../cube/defs';
import { permutationParity } from '../cube/facelet';

export type Rng = () => number;

export function randomMoveScramble(length = 25, rng: Rng = Math.random): number[] {
  const moves: number[] = [];
  let prevFace = -1;
  while (moves.length < length) {
    const m = Math.floor(rng() * N_MOVES);
    const face = MOVE_FACE[m];
    if (face === prevFace) continue;
    if (isRedundant(prevFace, face)) continue;
    moves.push(m);
    prevFace = face;
  }
  return moves;
}

function shuffle(arr: Uint8Array, rng: Rng): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
}

/** A state sampled uniformly from all 43,252,003,274,489,856,000 possibilities. */
export function randomState(rng: Rng = Math.random): CubieCube {
  const c = new CubieCube();
  shuffle(c.cp, rng);
  shuffle(c.ep, rng);
  // Law 3: the two permutations must have the same parity.
  if (permutationParity(c.cp) !== permutationParity(c.ep)) {
    const t = c.ep[0]; c.ep[0] = c.ep[1]; c.ep[1] = t;
  }
  // Law 1: total corner twist is 0 mod 3.
  let twistSum = 0;
  for (let i = 0; i < 7; i++) { c.co[i] = Math.floor(rng() * 3); twistSum += c.co[i]; }
  c.co[7] = (3 - (twistSum % 3)) % 3;
  // Law 2: an even number of edges are flipped.
  let flipSum = 0;
  for (let i = 0; i < 11; i++) { c.eo[i] = Math.floor(rng() * 2); flipSum += c.eo[i]; }
  c.eo[11] = flipSum & 1;
  return c;
}

/** Deterministic generator, so lessons and challenges can be reproducible. */
export function seededRng(seed: number): Rng {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
