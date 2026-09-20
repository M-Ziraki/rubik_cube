import { describe, expect, it } from 'vitest';
import { CubieCube, MOVE_CUBES } from './cubie';
import { diagnose, faceletString, fromFacelets, permutationParity, toFacelets } from './facelet';
import { formatSequence, invertSequence, parseSequence, simplifySequence } from './notation';
import { MOVE_NAMES, MOVE_POWER, SOLVED_FACELETS } from './defs';

function seq(s: string): number[] {
  const r = parseSequence(s);
  expect(r.errors).toEqual([]);
  return r.moves;
}

describe('move generators', () => {
  it('each quarter turn has order 4 and each half turn order 2', () => {
    for (let m = 0; m < 18; m++) {
      const order = MOVE_POWER[m] === 2 ? 2 : 4;
      let c = CubieCube.identity();
      for (let k = 0; k < order; k++) {
        expect(c.isSolved()).toBe(k === 0);
        c = c.multiply(MOVE_CUBES[m]);
      }
      expect(c.isSolved()).toBe(true);
    }
  });

  it('every generator is an even permutation of the 20 pieces', () => {
    for (let m = 0; m < 18; m++) {
      const c = MOVE_CUBES[m];
      expect(permutationParity(c.cp)).toBe(permutationParity(c.ep));
    }
  });

  it('every generator preserves the three physical laws', () => {
    for (let m = 0; m < 18; m++) {
      const c = MOVE_CUBES[m];
      expect(c.co.reduce((a, b) => a + b, 0) % 3).toBe(0);
      expect(c.eo.reduce((a, b) => a + b, 0) % 2).toBe(0);
    }
  });

  it('inverse undoes a move', () => {
    for (let m = 0; m < 18; m++) {
      expect(MOVE_CUBES[m].multiply(MOVE_CUBES[m].inverse()).isSolved()).toBe(true);
    }
  });

  it('commuting faces really commute and adjacent faces do not', () => {
    const U = MOVE_CUBES[0], D = MOVE_CUBES[9], R = MOVE_CUBES[3];
    expect(U.multiply(D).equals(D.multiply(U))).toBe(true);
    expect(U.multiply(R).equals(R.multiply(U))).toBe(false);
  });
});

describe('facelets', () => {
  it('solved cube renders the canonical sticker string', () => {
    expect(faceletString(toFacelets(CubieCube.identity()))).toBe(SOLVED_FACELETS);
  });

  it('round-trips random states', () => {
    let c = CubieCube.identity();
    for (let i = 0; i < 400; i++) {
      c = c.multiply(MOVE_CUBES[Math.floor(Math.random() * 18)]);
      const back = fromFacelets(toFacelets(c));
      expect(back.equals(c)).toBe(true);
    }
  });

  it('rejects an impossible single corner twist', () => {
    const c = CubieCube.identity();
    c.co[0] = 1;
    const d = diagnose(toFacelets(c));
    expect(d.ok).toBe(false);
    expect(d.problems.map((p) => p.code)).toContain('twist');
  });

  it('rejects an impossible single edge flip', () => {
    const c = CubieCube.identity();
    c.eo[0] = 1;
    const d = diagnose(toFacelets(c));
    expect(d.ok).toBe(false);
    expect(d.problems.map((p) => p.code)).toContain('flip');
  });

  it('rejects a lone two-piece swap', () => {
    const c = CubieCube.identity();
    [c.ep[0], c.ep[1]] = [c.ep[1], c.ep[0]];
    const d = diagnose(toFacelets(c));
    expect(d.ok).toBe(false);
    expect(d.problems.map((p) => p.code)).toContain('parity');
  });

  it('accepts every state reachable by turning faces', () => {
    let c = CubieCube.identity();
    for (let i = 0; i < 300; i++) {
      c = c.multiply(MOVE_CUBES[Math.floor(Math.random() * 18)]);
      expect(diagnose(toFacelets(c)).ok).toBe(true);
    }
  });

  it('flags a badly miscoloured cube without crashing', () => {
    const f = toFacelets(CubieCube.identity());
    f[0] = 1; f[1] = 1; f[2] = 1;
    const d = diagnose(f);
    expect(d.ok).toBe(false);
    expect(d.problems.length).toBeGreaterThan(0);
  });
});

describe('known cube identities', () => {
  it('the sexy move has order 6', () => {
    const s = seq("R U R' U'");
    let c = CubieCube.identity();
    for (let k = 0; k < 6; k++) {
      expect(c.isSolved()).toBe(k === 0);
      c.applyMoves(s);
    }
    expect(c.isSolved()).toBe(true);
  });

  it('R U has order 105', () => {
    const s = seq('R U');
    const c = CubieCube.identity();
    let order = 0;
    do { c.applyMoves(s); order++; } while (!c.isSolved() && order < 500);
    expect(order).toBe(105);
  });

  it('the 20-move superflip flips all twelve edges and nothing else', () => {
    const s = seq("R L U2 F U' D F2 R2 B2 L U2 F' B' U R2 D F2 U R2 U");
    expect(s.length).toBe(20);
    const c = CubieCube.fromMoves(s);
    for (let i = 0; i < 8; i++) { expect(c.cp[i]).toBe(i); expect(c.co[i]).toBe(0); }
    for (let i = 0; i < 12; i++) { expect(c.ep[i]).toBe(i); expect(c.eo[i]).toBe(1); }
  });

  it('the superflip is its own inverse', () => {
    const s = seq("R L U2 F U' D F2 R2 B2 L U2 F' B' U R2 D F2 U R2 U");
    const c = CubieCube.fromMoves(s);
    expect(c.multiply(c).isSolved()).toBe(true);
  });

  it('a T-perm swaps two corners and two edges', () => {
    const c = CubieCube.fromMoves(seq("R U R' U' R' F R2 U' R' U' R U R' F'"));
    let movedCorners = 0, movedEdges = 0;
    for (let i = 0; i < 8; i++) if (c.cp[i] !== i || c.co[i] !== 0) movedCorners++;
    for (let i = 0; i < 12; i++) if (c.ep[i] !== i || c.eo[i] !== 0) movedEdges++;
    expect(movedCorners).toBe(2);
    expect(movedEdges).toBe(2);
  });
});

describe('notation', () => {
  it('parses and reformats', () => {
    expect(formatSequence(seq("R U R' U2 B'"))).toBe("R U R' U2 B'");
  });
  it('reports unknown tokens', () => {
    expect(parseSequence('R X U').errors.map((e) => e.token)).toEqual(['X']);
  });
  it('inverts a sequence', () => {
    const s = seq("R U F' D2");
    expect(CubieCube.fromMoves(s).multiply(CubieCube.fromMoves(invertSequence(s))).isSolved()).toBe(true);
  });
  it('simplifies without changing the state', () => {
    for (let t = 0; t < 200; t++) {
      const raw: number[] = [];
      for (let i = 0; i < 14; i++) raw.push(Math.floor(Math.random() * 18));
      const simple = simplifySequence(raw);
      expect(simple.length).toBeLessThanOrEqual(raw.length);
      expect(CubieCube.fromMoves(simple).equals(CubieCube.fromMoves(raw))).toBe(true);
    }
  });
  it('cancels obvious pairs', () => {
    expect(formatSequence(simplifySequence(seq("R R'")))).toBe('');
    expect(formatSequence(simplifySequence(seq('R R')))).toBe('R2');
    expect(formatSequence(simplifySequence(seq("U D U'")))).toBe('D');
    expect(MOVE_NAMES[simplifySequence(seq("R R R"))[0]]).toBe("R'");
  });
});
