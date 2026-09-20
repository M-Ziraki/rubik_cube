import { describe, expect, it } from 'vitest';
import {
  CIRCLE_RADII, FAMILIES, MAP_CIRCLES, STICKER_NODES, bandCircleForMove,
  bandStepsForMove, destinationOf, faceletsAffectedBy, nodeForFacelet,
  siblingFacelets, sourceOf,
} from './stickerMap';
import reference from './referenceNodes.json';
import { CubieCube } from '../cube/cubie';
import { FACE_NAMES, MOVE_NAMES, MOVE_FACE, MOVE_INVERSE } from '../cube/defs';
import { faceletString, toFacelets } from '../cube/facelet';
import { faceletAt } from '../cube/geometry';

describe('the recovered construction', () => {
  it('produces exactly 54 nodes and 9 circles', () => {
    expect(STICKER_NODES.length).toBe(54);
    expect(MAP_CIRCLES.length).toBe(9);
    expect(FAMILIES.length).toBe(3);
  });

  it('covers every facelet exactly once', () => {
    const seen = new Set(STICKER_NODES.map((n) => n.facelet));
    expect(seen.size).toBe(54);
    for (let f = 0; f < 54; f++) {
      expect(seen.has(f)).toBe(true);
      expect(nodeForFacelet(f).facelet).toBe(f);
    }
  });

  it('puts nine nodes on each face', () => {
    const per = new Array(6).fill(0);
    for (const n of STICKER_NODES) per[n.face]++;
    expect(per).toEqual([9, 9, 9, 9, 9, 9]);
  });

  it('places every node on exactly two circles, from different families', () => {
    for (const n of STICKER_NODES) {
      expect(n.circles.length).toBe(2);
      const a = MAP_CIRCLES[n.circles[0]];
      const b = MAP_CIRCLES[n.circles[1]];
      expect(a.family.id).not.toBe(b.family.id);
      // and the node really does lie on both, to within floating-point noise
      expect(Math.hypot(n.x - a.cx, n.y - a.cy)).toBeCloseTo(a.radius, 9);
      expect(Math.hypot(n.x - b.cx, n.y - b.cy)).toBeCloseTo(b.radius, 9);
    }
  });

  it('gives every node a consistent cubie coordinate and facing direction', () => {
    for (const n of STICKER_NODES) {
      expect(faceletAt(n.position, n.normal)).toBe(n.facelet);
      // exactly one coordinate is the face normal's axis, at +-1
      const axis = n.normal.findIndex((v) => v !== 0);
      expect(Math.abs(n.position[axis])).toBe(1);
      expect(n.position[axis]).toBe(n.normal[axis]);
    }
  });

  it('matches the dots measured in the reference animation', () => {
    // Each measured dot must have a generated node essentially on top of it.
    const unused = new Set(STICKER_NODES.map((_, i) => i));
    let worst = 0;
    for (const ref of reference.nodes) {
      let best = -1;
      let bd = Infinity;
      for (const i of unused) {
        const d = Math.hypot(STICKER_NODES[i].x - ref.x, STICKER_NODES[i].y - ref.y);
        if (d < bd) { bd = d; best = i; }
      }
      unused.delete(best);
      worst = Math.max(worst, bd);
    }
    expect(unused.size).toBe(0);
    // 0.02 of a unit is about 1.3 pixels at the video's scale.
    expect(worst).toBeLessThan(0.02);
  });

  it('reproduces the reference colour clusters when solved', () => {
    const solved = faceletString(toFacelets(CubieCube.identity()));
    // group the measured dots by the colour the video shows them, then check
    // each group is exactly one of our faces
    const groups = new Map<string, number[]>();
    const taken = new Set<number>();
    for (const ref of reference.nodes) {
      let best = -1;
      let bd = Infinity;
      STICKER_NODES.forEach((n, i) => {
        if (taken.has(i)) return;
        const d = Math.hypot(n.x - ref.x, n.y - ref.y);
        if (d < bd) { bd = d; best = i; }
      });
      taken.add(best);
      const list = groups.get(ref.colour) ?? [];
      list.push(STICKER_NODES[best].face);
      groups.set(ref.colour, list);
    }
    expect(groups.size).toBe(6);
    const faces = new Set<number>();
    for (const [, list] of groups) {
      expect(list.length).toBe(9);
      expect(new Set(list).size).toBe(1); // all nine share one face
      faces.add(list[0]);
    }
    expect(faces.size).toBe(6);
    expect(solved.length).toBe(54);
  });

  it('keeps the radii in the measured order', () => {
    expect(CIRCLE_RADII[0]).toBeLessThan(CIRCLE_RADII[1]);
    expect(CIRCLE_RADII[1]).toBeLessThan(CIRCLE_RADII[2]);
  });
});

describe('circles as cube bands', () => {
  it('threads twelve facelets onto every circle', () => {
    for (const c of MAP_CIRCLES) expect(c.band.length).toBe(12);
  });

  it('makes each band a genuine layer of the cube', () => {
    for (const c of MAP_CIRCLES) {
      for (const f of c.band) {
        const n = nodeForFacelet(f);
        // every facelet on the circle sits in the same layer along the family's axis
        expect(n.position[c.family.axis]).toBe(c.layer);
        // and none of them is on a face perpendicular to that axis
        expect(n.normal[c.family.axis]).toBe(0);
      }
      expect(new Set(c.band).size).toBe(12);
    }
  });

  it('gives each outer band exactly the twelve facelets a face turn cycles', () => {
    for (let m = 0; m < 18; m += 3) {
      const circle = bandCircleForMove(m);
      const cube = CubieCube.identity().applyMove(m);
      const before = toFacelets(CubieCube.identity());
      const after = toFacelets(cube);
      const moved: number[] = [];
      for (let f = 0; f < 54; f++) if (before[f] !== after[f]) moved.push(f);
      const faceOwn = new Set<number>();
      for (let i = 0; i < 9; i++) if (i !== 4) faceOwn.add(MOVE_FACE[m] * 9 + i);
      const bandMoved = moved.filter((f) => !faceOwn.has(f));
      // the facelets that move and are not on the turned face are exactly the band
      expect(new Set(bandMoved)).toEqual(new Set(circle.band));
      expect(bandMoved.length).toBe(12);
    }
  });

  it('advances a band by three places per quarter turn', () => {
    for (let m = 0; m < 18; m++) {
      const circle = bandCircleForMove(m);
      const steps = bandStepsForMove(m);
      expect(steps).toBe(3 * (MOVE_POWERS[m]));
      const before = toFacelets(CubieCube.identity());
      const after = toFacelets(CubieCube.identity().applyMove(m));
      // Walking the band in order, the colour that lands on each position must
      // be the one that started `steps` places away, in one direction or the
      // other. Which direction depends on how the circle is wound.
      const fwd = circle.band.every((f, k) => {
        const src = circle.band[(k + steps) % 12];
        return after[f] === before[src];
      });
      const bwd = circle.band.every((f, k) => {
        const src = circle.band[(k - steps + 24) % 12];
        return after[f] === before[src];
      });
      expect(fwd || bwd).toBe(true);
    }
  });

  it('lists the right facelets as affected by a move', () => {
    for (let m = 0; m < 18; m++) {
      const affected = new Set(faceletsAffectedBy(m));
      const before = toFacelets(CubieCube.identity());
      const after = toFacelets(CubieCube.identity().applyMove(m));
      for (let f = 0; f < 54; f++) {
        if (before[f] !== after[f]) expect(affected.has(f)).toBe(true);
      }
      expect(affected.size).toBe(20);
    }
  });
});

const MOVE_POWERS = MOVE_NAMES.map((_, i) => (i % 3) + 1);

describe('the map follows real cube permutations', () => {
  const render = (c: CubieCube): string[] => {
    const f = toFacelets(c);
    return STICKER_NODES.map((n) => FACE_NAMES[f[n.facelet]]);
  };

  it('a move followed by its inverse restores every dot', () => {
    for (let m = 0; m < 18; m++) {
      const start = CubieCube.fromMoves([3, 0, 8, 13, 5]);
      const before = render(start);
      const after = render(start.clone().applyMove(m).applyMove(MOVE_INVERSE[m]));
      expect(after).toEqual(before);
    }
  });

  it('four quarter turns of a face restore every dot', () => {
    for (let face = 0; face < 6; face++) {
      const start = CubieCube.fromMoves([1, 7, 12, 4]);
      const c = start.clone();
      const before = render(start);
      for (let k = 0; k < 4; k++) {
        if (k > 0) expect(render(c)).not.toEqual(before);
        c.applyMove(face * 3);
      }
      expect(render(c)).toEqual(before);
    }
  });

  it('shows six monochrome clusters exactly when the cube is solved', () => {
    const solvedView = render(CubieCube.identity());
    const byFace = new Map<number, Set<string>>();
    STICKER_NODES.forEach((n, i) => {
      const s = byFace.get(n.face) ?? new Set<string>();
      s.add(solvedView[i]);
      byFace.set(n.face, s);
    });
    expect(byFace.size).toBe(6);
    for (const [, s] of byFace) expect(s.size).toBe(1);

    const scrambled = render(CubieCube.fromMoves([3, 1, 8]));
    const mixed = scrambled.filter((v, i) => v !== solvedView[i]).length;
    expect(mixed).toBeGreaterThan(0);
  });

  it('agrees with the cube model for a long random sequence', () => {
    const c = CubieCube.identity();
    for (let step = 0; step < 300; step++) {
      c.applyMove(Math.floor(Math.random() * 18));
      const view = render(c);
      // nine dots of each colour, always - the map can never invent a sticker
      const counts = new Map<string, number>();
      view.forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1));
      expect([...counts.values()].sort()).toEqual([9, 9, 9, 9, 9, 9]);
      // and each dot shows exactly what the cube model says
      const f = toFacelets(c);
      STICKER_NODES.forEach((n, i) => expect(view[i]).toBe(FACE_NAMES[f[n.facelet]]));
    }
  });

  it('knows which facelets share a piece', () => {
    expect(siblingFacelets(4)).toEqual([]);      // a centre is alone
    expect(siblingFacelets(8).length).toBe(2);   // a corner has two partners
    expect(siblingFacelets(5).length).toBe(1);   // an edge has one
    for (let f = 0; f < 54; f++) {
      for (const s of siblingFacelets(f)) expect(siblingFacelets(s)).toContain(f);
    }
  });
});

describe('the sticker shuffle used by the animation', () => {
  it('matches what the cube model does, for every move', () => {
    for (let m = 0; m < 18; m++) {
      const start = CubieCube.fromMoves([5, 12, 2, 16, 8, 3]);
      const before = toFacelets(start);
      const after = toFacelets(start.clone().applyMove(m));
      const from = sourceOf(m);
      for (let f = 0; f < 54; f++) {
        // the sticker that lands on f must be the one the permutation names
        expect(after[f]).toBe(before[from[f]]);
      }
    }
  });

  it('is a permutation, and its inverse is the inverse move', () => {
    for (let m = 0; m < 18; m++) {
      const to = destinationOf(m);
      expect(new Set(to).size).toBe(54);
      const inv = destinationOf(MOVE_INVERSE[m]);
      for (let f = 0; f < 54; f++) expect(inv[to[f]]).toBe(f);
    }
  });

  it('leaves centres and untouched faces alone', () => {
    for (let m = 0; m < 18; m++) {
      const to = destinationOf(m);
      for (let face = 0; face < 6; face++) expect(to[face * 9 + 4]).toBe(face * 9 + 4);
      let moved = 0;
      for (let f = 0; f < 54; f++) if (to[f] !== f) moved++;
      expect(moved).toBe(20);
    }
  });

  it('returns to the start after four quarter turns', () => {
    for (let face = 0; face < 6; face++) {
      const to = destinationOf(face * 3);
      for (let f = 0; f < 54; f++) {
        expect(to[to[to[to[f]]]]).toBe(f);
      }
    }
  });
});
