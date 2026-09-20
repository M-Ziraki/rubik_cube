/**
 * Reading and writing move sequences.
 *
 * The app speaks the face-turn metric (HTM/QTM-with-half-turns): U, U2 and U'
 * are each one move. That is the metric God's number 20 is stated in, so it is
 * the one the whole application counts in.
 */

import { MOVE_FACE, MOVE_INVERSE, MOVE_NAMES, MOVE_POWER, type MoveName } from './defs';

export function parseMove(token: string): number {
  const t = token.trim();
  const m = /^([URFDLB])(['’]?)(2?)(['’]?)$/.exec(t.toUpperCase().replace('W', ''));
  if (!m) return -1;
  const face = 'URFDLB'.indexOf(m[1]);
  const prime = Boolean(m[2] || m[4]);
  const dbl = Boolean(m[3]);
  let power = dbl ? 2 : 1;
  if (prime) power = dbl ? 2 : 3;
  return face * 3 + (power - 1);
}

export interface ParseResult {
  moves: number[];
  errors: { token: string; index: number }[];
}

export function parseSequence(text: string): ParseResult {
  const tokens = text.split(/[\s,]+/).filter(Boolean);
  const moves: number[] = [];
  const errors: { token: string; index: number }[] = [];
  tokens.forEach((tok, i) => {
    const m = parseMove(tok);
    if (m < 0) errors.push({ token: tok, index: i });
    else moves.push(m);
  });
  return { moves, errors };
}

export function formatSequence(moves: ArrayLike<number>): string {
  const out: string[] = [];
  for (let i = 0; i < moves.length; i++) out.push(MOVE_NAMES[moves[i]]);
  return out.join(' ');
}

export function invertSequence(moves: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let i = moves.length - 1; i >= 0; i--) out.push(MOVE_INVERSE[moves[i]]);
  return out;
}

/**
 * Collapse obviously redundant adjacent moves (U U -> U2, U U' -> nothing,
 * and the same across a commuting pair like U D U). The result is always at
 * most as long as the input and describes the same permutation.
 */
export function simplifySequence(moves: ArrayLike<number>): number[] {
  let seq = Array.from(moves);
  let changed = true;
  while (changed) {
    changed = false;
    const out: number[] = [];
    for (let i = 0; i < seq.length; i++) {
      const cur = seq[i];
      // Look back past a commuting move on the opposite face.
      let target = out.length - 1;
      if (target >= 0 && MOVE_FACE[out[target]] !== MOVE_FACE[cur]
        && target - 1 >= 0 && MOVE_FACE[out[target - 1]] === MOVE_FACE[cur]
        && Math.abs(MOVE_FACE[out[target]] - MOVE_FACE[cur]) === 3) {
        target -= 1;
      }
      if (target >= 0 && MOVE_FACE[out[target]] === MOVE_FACE[cur]) {
        const power = (MOVE_POWER[out[target]] + MOVE_POWER[cur]) % 4;
        out.splice(target, 1);
        if (power !== 0) out.splice(target, 0, MOVE_FACE[cur] * 3 + (power - 1));
        changed = true;
      } else {
        out.push(cur);
      }
    }
    seq = out;
  }
  return seq;
}

export function moveLabel(move: number): MoveName {
  return MOVE_NAMES[move];
}

/** Human description of what a move physically does. */
export function describeMove(move: number): string {
  const face = 'URFDLB'[MOVE_FACE[move]];
  const power = MOVE_POWER[move];
  const faceWord = { U: 'top', R: 'right', F: 'front', D: 'bottom', L: 'left', B: 'back' }[face]!;
  if (power === 2) return `Turn the ${faceWord} face a half turn (180°).`;
  const dir = power === 1 ? 'clockwise' : 'anticlockwise';
  return `Turn the ${faceWord} face a quarter turn ${dir}, looking straight at that face.`;
}
