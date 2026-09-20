/**
 * The cubie-level model: a cube state is a permutation of 8 corners and 12
 * edges together with an orientation for each piece.
 *
 *   cp[i] = which corner piece currently sits in slot i
 *   co[i] = how far that corner is twisted (0, 1 or 2 clockwise sixths-turns)
 *   ep[i] = which edge piece currently sits in slot i
 *   eo[i] = whether that edge is flipped (0 or 1)
 *
 * Composition is `multiply`: `a.multiply(b)` is the state you get by being in
 * state `a` and then performing the transformation `b`. This makes the set of
 * states a group, and every solver in the app is really just a search in the
 * Cayley graph of that group with the 18 face turns as generators.
 */

import { MOVE_NAMES, MOVE_FACE, MOVE_POWER, N_MOVES } from './defs';

export interface CubieState {
  cp: Uint8Array; // length 8
  co: Uint8Array; // length 8
  ep: Uint8Array; // length 12
  eo: Uint8Array; // length 12
}

export class CubieCube implements CubieState {
  cp: Uint8Array;
  co: Uint8Array;
  ep: Uint8Array;
  eo: Uint8Array;

  constructor(cp?: ArrayLike<number>, co?: ArrayLike<number>, ep?: ArrayLike<number>, eo?: ArrayLike<number>) {
    this.cp = cp ? Uint8Array.from(cp) : Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7]);
    this.co = co ? Uint8Array.from(co) : new Uint8Array(8);
    this.ep = ep ? Uint8Array.from(ep) : Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    this.eo = eo ? Uint8Array.from(eo) : new Uint8Array(12);
  }

  static identity(): CubieCube {
    return new CubieCube();
  }

  clone(): CubieCube {
    return new CubieCube(this.cp, this.co, this.ep, this.eo);
  }

  copyFrom(other: CubieState): this {
    this.cp.set(other.cp);
    this.co.set(other.co);
    this.ep.set(other.ep);
    this.eo.set(other.eo);
    return this;
  }

  isSolved(): boolean {
    for (let i = 0; i < 8; i++) if (this.cp[i] !== i || this.co[i] !== 0) return false;
    for (let i = 0; i < 12; i++) if (this.ep[i] !== i || this.eo[i] !== 0) return false;
    return true;
  }

  equals(other: CubieState): boolean {
    for (let i = 0; i < 8; i++) if (this.cp[i] !== other.cp[i] || this.co[i] !== other.co[i]) return false;
    for (let i = 0; i < 12; i++) if (this.ep[i] !== other.ep[i] || this.eo[i] !== other.eo[i]) return false;
    return true;
  }

  /** Group composition: the state reached by applying `b` to this state. */
  multiply(b: CubieState): CubieCube {
    return this.clone().multiplyInPlace(b);
  }

  multiplyInPlace(b: CubieState): this {
    const cp = new Uint8Array(8);
    const co = new Uint8Array(8);
    for (let i = 0; i < 8; i++) {
      const src = b.cp[i];
      cp[i] = this.cp[src];
      co[i] = (this.co[src] + b.co[i]) % 3;
    }
    const ep = new Uint8Array(12);
    const eo = new Uint8Array(12);
    for (let i = 0; i < 12; i++) {
      const src = b.ep[i];
      ep[i] = this.ep[src];
      eo[i] = (this.eo[src] + b.eo[i]) & 1;
    }
    this.cp.set(cp); this.co.set(co); this.ep.set(ep); this.eo.set(eo);
    return this;
  }

  /** The state that undoes this one. */
  inverse(): CubieCube {
    const out = new CubieCube();
    for (let i = 0; i < 8; i++) out.cp[this.cp[i]] = i;
    for (let i = 0; i < 8; i++) {
      const ori = this.co[out.cp[i]];
      out.co[i] = ori === 0 ? 0 : 3 - ori;
    }
    for (let i = 0; i < 12; i++) out.ep[this.ep[i]] = i;
    for (let i = 0; i < 12; i++) out.eo[i] = this.eo[out.ep[i]];
    return out;
  }

  /** Apply a single move index (0..17). */
  applyMove(move: number): this {
    return this.multiplyInPlace(MOVE_CUBES[move]);
  }

  /** Apply a whole sequence of move indices. */
  applyMoves(moves: ArrayLike<number>): this {
    for (let i = 0; i < moves.length; i++) this.multiplyInPlace(MOVE_CUBES[moves[i]]);
    return this;
  }

  static fromMoves(moves: ArrayLike<number>): CubieCube {
    return new CubieCube().applyMoves(moves);
  }

  /**
   * A short, stable textual key for a state. Used as a hash key when building
   * the small explicit graphs the visualisations walk over.
   */
  key(): string {
    let s = '';
    for (let i = 0; i < 8; i++) s += (this.cp[i] * 3 + this.co[i]).toString(36);
    for (let i = 0; i < 12; i++) s += (this.ep[i] * 2 + this.eo[i]).toString(36);
    return s;
  }
}

/** Corner/edge tables for the six clockwise quarter turns. */
const BASE: Record<string, [number[], number[], number[], number[]]> = {
  U: [
    [3, 0, 1, 2, 4, 5, 6, 7], [0, 0, 0, 0, 0, 0, 0, 0],
    [3, 0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  ],
  R: [
    [4, 1, 2, 0, 7, 5, 6, 3], [2, 0, 0, 1, 1, 0, 0, 2],
    [8, 1, 2, 3, 11, 5, 6, 7, 4, 9, 10, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  ],
  F: [
    [1, 5, 2, 3, 0, 4, 6, 7], [1, 2, 0, 0, 2, 1, 0, 0],
    [0, 9, 2, 3, 4, 8, 6, 7, 1, 5, 10, 11], [0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0],
  ],
  D: [
    [0, 1, 2, 3, 5, 6, 7, 4], [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 1, 2, 3, 5, 6, 7, 4, 8, 9, 10, 11], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  ],
  L: [
    [0, 2, 6, 3, 4, 1, 5, 7], [0, 1, 2, 0, 0, 2, 1, 0],
    [0, 1, 10, 3, 4, 5, 9, 7, 8, 2, 6, 11], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  ],
  B: [
    [0, 1, 3, 7, 4, 5, 2, 6], [0, 0, 1, 2, 0, 0, 2, 1],
    [0, 1, 2, 11, 4, 5, 6, 10, 8, 9, 3, 7], [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1],
  ],
};

/** The 18 generators of the group, as cubie states. */
export const MOVE_CUBES: CubieCube[] = (() => {
  const out: CubieCube[] = [];
  for (let m = 0; m < N_MOVES; m++) {
    const faceLetter = 'URFDLB'[MOVE_FACE[m]];
    const [cp, co, ep, eo] = BASE[faceLetter];
    const quarter = new CubieCube(cp, co, ep, eo);
    let acc = CubieCube.identity();
    for (let k = 0; k < MOVE_POWER[m]; k++) acc = acc.multiply(quarter);
    out.push(acc);
  }
  return out;
})();

export function moveName(move: number): string {
  return MOVE_NAMES[move];
}
