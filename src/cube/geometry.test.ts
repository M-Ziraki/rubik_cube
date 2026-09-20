import { describe, expect, it } from 'vitest';
import { CubieCube, MOVE_CUBES } from './cubie';
import { toFacelets, fromFacelets, diagnose } from './facelet';
import {
  IDENTITY_REORIENTATION, ROT_X, ROT_Y, ROT_Z, faceletAt, faceletNormal, faceletPosition,
  invertFacePerm, reorientFacelets, reorientation, rotPower,
} from './geometry';
import { CORNER_FACELET, EDGE_FACELET, MOVE_FACE, MOVE_POWER } from './defs';

describe('facelet geometry', () => {
  it('assigns every facelet a distinct (position, normal)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 54; i++) {
      const p = faceletPosition(i);
      const n = faceletNormal(i);
      expect(faceletAt(p, n)).toBe(i);
      seen.add(`${p.join(',')}|${n.join(',')}`);
    }
    expect(seen.size).toBe(54);
  });

  it('the three facelets of each corner share one cubie coordinate', () => {
    for (const trio of CORNER_FACELET) {
      const ps = trio.map(faceletPosition);
      expect(ps[1]).toEqual(ps[0]);
      expect(ps[2]).toEqual(ps[0]);
      expect(ps[0].filter((v) => v === 0).length).toBe(0);
    }
  });

  it('the two facelets of each edge share one cubie coordinate', () => {
    for (const pair of EDGE_FACELET) {
      const ps = pair.map(faceletPosition);
      expect(ps[1]).toEqual(ps[0]);
      expect(ps[0].filter((v) => v === 0).length).toBe(1);
    }
  });

  it('centres sit at the face centre', () => {
    for (let f = 0; f < 6; f++) {
      expect(faceletPosition(f * 9 + 4).filter((v) => v === 0).length).toBe(2);
    }
  });
});

describe('whole-cube rotations', () => {
  const rots = [
    reorientation('x', ROT_X), reorientation('y', ROT_Y), reorientation('z', ROT_Z),
    reorientation('x2', rotPower(ROT_X, 2)), reorientation('y2', rotPower(ROT_Y, 2)),
  ];

  it('each rotation permutes the 54 facelets and the 6 faces', () => {
    for (const r of rots) {
      expect(new Set(r.faceletPerm).size).toBe(54);
      expect(new Set(r.facePerm).size).toBe(6);
    }
  });

  it('rotating a solved cube leaves it solved', () => {
    const solved = toFacelets(CubieCube.identity());
    for (const r of rots) {
      const f = reorientFacelets(solved, r);
      expect(Array.from(f)).toEqual(Array.from(solved));
    }
  });

  it('rotating any legal state gives another legal state', () => {
    let c = CubieCube.identity();
    for (let i = 0; i < 60; i++) {
      c = c.applyMove(Math.floor(Math.random() * 18));
      for (const r of rots) {
        expect(diagnose(reorientFacelets(toFacelets(c), r)).ok).toBe(true);
      }
    }
  });

  it('a move in the rotated frame is the renamed move in the original frame', () => {
    // Rotating the cube then turning face pi(f) must equal turning face f then
    // rotating. This is the identity the multi-axis solver relies on.
    for (const r of rots) {
      for (let m = 0; m < 18; m++) {
        const rotatedMove = r.facePerm[MOVE_FACE[m]] * 3 + (MOVE_POWER[m] - 1);
        let c = CubieCube.identity();
        for (let i = 0; i < 5; i++) c = c.applyMove(Math.floor(Math.random() * 18));
        const lhs = reorientFacelets(toFacelets(c.clone().applyMove(m)), r);
        const rhs = toFacelets(fromFacelets(reorientFacelets(toFacelets(c), r)).applyMove(rotatedMove));
        expect(Array.from(lhs)).toEqual(Array.from(rhs));
      }
    }
  });

  it('inverting a face permutation round-trips', () => {
    for (const r of rots) {
      const inv = invertFacePerm(r.facePerm);
      for (let f = 0; f < 6; f++) expect(inv[r.facePerm[f]]).toBe(f);
    }
    expect(IDENTITY_REORIENTATION.facePerm).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('applying a rotation four times returns to the start', () => {
    const r4 = reorientation('x4', rotPower(ROT_X, 4));
    expect(r4.faceletPerm).toEqual(IDENTITY_REORIENTATION.faceletPerm);
    expect(MOVE_CUBES.length).toBe(18);
  });
});
