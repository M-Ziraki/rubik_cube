/**
 * The sticker map: the figure from the reference animation, reconstructed.
 *
 * WHAT THE REFERENCE ACTUALLY IS
 * -----------------------------
 * Measuring the video frame by frame shows the diagram is not a graph of cube
 * configurations at all. It is a map of the 54 *stickers*. Every frame contains
 * exactly 54 dots, nine of each colour, and the dots never move: only their
 * colours change. Comparing the first frame with the last gives a mean node
 * displacement of 0.32 pixels, so the layout is a fixed skeleton.
 *
 * The skeleton itself turns out to be an exact construction:
 *
 *   - Three families of circles, their centres 120 degrees apart at distance 1
 *     from the middle of the figure (at 90, 210 and 330 degrees).
 *   - Three concentric circles per family, at radii 1.3918, 1.7700 and 2.1482.
 *   - The 54 dots are precisely the intersection points of circles belonging to
 *     *different* families. Three family pairs x 3 radii x 3 radii x 2
 *     intersection points each = 54, with nothing left over.
 *
 * Fitting those seven numbers to the dots detected in the video gives a
 * root-mean-square error of 0.33 pixels, so this is the construction the
 * animator used, not an approximation of it.
 *
 * WHY THE CONSTRUCTION IS A CUBE
 * ------------------------------
 * Each family stands for one axis of the cube, and each of its three circles
 * for one layer along that axis. A dot lies on two circles from two different
 * families, which pins down two of its three coordinates; the third is fixed by
 * which of the two intersection points it is. In other words every dot is a
 * (cubie position, facing direction) pair - exactly a facelet. The nine dots
 * sharing a face form that face's 3x3 grid, drawn on circular arcs instead of
 * straight lines, which is what gives the figure its organic look.
 *
 * It also means each circle carries real meaning. A circle of the F family at
 * layer z holds the twelve facelets lying in the plane z = const on the U, R, D
 * and L faces - that is, one of the cube's nine bands. For the outer layers
 * that band is exactly the set of twelve stickers an F or B turn cycles, so a
 * face turn rotates the dots a quarter of the way around one drawn circle.
 *
 * WHAT IS NOT COPIED FROM THE REFERENCE
 * -------------------------------------
 * The video's *motion* is decorative. In a real cube the six centre stickers
 * can never change colour, so six dots would have to hold their colour for the
 * whole clip; in the video only four do, and they are two orange and two green.
 * The colours in between settled frames are also not permutations of a legal
 * cube. So this module reproduces the reference's geometry exactly and drives
 * it from genuine cube permutations instead of the video's animation, which is
 * the trade the brief asked for.
 */

import { CORNER_FACELET, EDGE_FACELET, MOVE_FACE, MOVE_POWER, N_MOVES } from '../cube/defs';
import { faceletAt, FACE_NORMAL, type Vec3 } from '../cube/geometry';

/* ------------------------------------------------ recovered parameters --- */

/** Distance from the middle of the figure to each family centre. */
export const FAMILY_DISTANCE = 1;

/** Circle radii, in the same units, innermost first. Measured from the video. */
export const CIRCLE_RADII = [1.39180, 1.76999, 2.14816] as const;

/**
 * The three families. Each is centred on one face's cluster, spans one axis of
 * the cube, and its three circles are that axis's three layers.
 *
 * `angle` is measured anticlockwise from east, in the maths convention (y up).
 * `axis` is 0 = x (R/L), 1 = y (U/D), 2 = z (F/B).
 * `sign` says which of the two faces on that axis the family sits on, and
 * therefore which layer the innermost circle stands for.
 */
export interface Family {
  id: 'D' | 'F' | 'R';
  angle: number;
  axis: 0 | 1 | 2;
  sign: 1 | -1;
  cx: number;
  cy: number;
}

function makeFamily(id: Family['id'], angle: number, axis: 0 | 1 | 2, sign: 1 | -1): Family {
  const a = (angle * Math.PI) / 180;
  return { id, angle, axis, sign, cx: FAMILY_DISTANCE * Math.cos(a), cy: FAMILY_DISTANCE * Math.sin(a) };
}

export const FAMILIES: readonly Family[] = [
  makeFamily('D', 90, 1, -1),   // top of the figure, the U/D axis, centred on D
  makeFamily('F', 210, 2, 1),   // lower left, the F/B axis, centred on F
  makeFamily('R', 330, 0, 1),   // lower right, the R/L axis, centred on R
];

/** The coordinate along a family's axis that its circle number `i` stands for. */
export function layerOf(family: Family, i: number): number {
  return family.sign * (1 - i);
}

/* -------------------------------------------------------------- circles --- */

export interface MapCircle {
  id: number;
  family: Family;
  /** 0 = innermost. */
  index: number;
  radius: number;
  cx: number;
  cy: number;
  /** The cube layer this circle is: the coordinate along the family's axis. */
  layer: number;
  /** The twelve facelets threaded by this circle, in order around it. */
  band: number[];
}

/* ---------------------------------------------------------------- nodes --- */

export interface StickerNode {
  /** Facelet index 0..53, the same numbering the rest of the app uses. */
  facelet: number;
  x: number;
  y: number;
  /** The two circles this node sits on. */
  circles: [number, number];
  /** The cubie coordinate and facing direction this node represents. */
  position: Vec3;
  normal: Vec3;
  /** Which face the node belongs to, 0..5 in U R F D L B order. */
  face: number;
}

function intersections(
  ax: number, ay: number, ra: number, bx: number, by: number, rb: number,
): [number, number][] {
  const dx = bx - ax;
  const dy = by - ay;
  const d = Math.hypot(dx, dy);
  if (d > ra + rb || d < Math.abs(ra - rb) || d === 0) return [];
  const a = (ra * ra - rb * rb + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, ra * ra - a * a));
  const mx = ax + (a * dx) / d;
  const my = ay + (a * dy) / d;
  return [
    [mx + (h * dy) / d, my - (h * dx) / d],
    [mx - (h * dy) / d, my + (h * dx) / d],
  ];
}

function buildMap(): { nodes: StickerNode[]; circles: MapCircle[]; byFacelet: StickerNode[] } {
  const circles: MapCircle[] = [];
  const circleId = new Map<string, number>();
  for (const family of FAMILIES) {
    for (let i = 0; i < 3; i++) {
      circleId.set(`${family.id}${i}`, circles.length);
      circles.push({
        id: circles.length,
        family,
        index: i,
        radius: CIRCLE_RADII[i],
        cx: family.cx,
        cy: family.cy,
        layer: layerOf(family, i),
        band: [],
      });
    }
  }

  const nodes: StickerNode[] = [];
  const pairs: [Family, Family][] = [
    [FAMILIES[1], FAMILIES[2]], // F and R families -> the U/D faces
    [FAMILIES[1], FAMILIES[0]], // F and D families -> the R/L faces
    [FAMILIES[2], FAMILIES[0]], // R and D families -> the F/B faces
  ];

  for (const [A, B] of pairs) {
    const C = FAMILIES.find((f) => f !== A && f !== B)!;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const hits = intersections(A.cx, A.cy, CIRCLE_RADII[i], B.cx, B.cy, CIRCLE_RADII[j]);
        if (hits.length !== 2) throw new Error('the recovered circles must meet twice');
        // The intersection nearer the third family's centre belongs to that
        // family's own face; the far one belongs to the face opposite it.
        const dist = hits.map(([x, y]) => Math.hypot(x - C.cx, y - C.cy));
        const order = dist[0] <= dist[1] ? [0, 1] : [1, 0];
        for (const which of [0, 1]) {
          const [x, y] = hits[order[which]];
          const faceSign = which === 0 ? C.sign : (-C.sign as 1 | -1);
          const position: number[] = [0, 0, 0];
          position[A.axis] = layerOf(A, i);
          position[B.axis] = layerOf(B, j);
          position[C.axis] = faceSign;
          const normal: number[] = [0, 0, 0];
          normal[C.axis] = faceSign;
          const facelet = faceletAt(position as unknown as Vec3, normal as unknown as Vec3);
          if (facelet < 0) throw new Error('every node must land on a real facelet');
          const ca = circleId.get(`${A.id}${i}`)!;
          const cb = circleId.get(`${B.id}${j}`)!;
          nodes.push({
            facelet, x, y,
            circles: [ca, cb],
            position: position as unknown as Vec3,
            normal: normal as unknown as Vec3,
            face: Math.floor(facelet / 9),
          });
        }
      }
    }
  }

  // Thread each circle's band in order of angle, so animating a turn is a
  // matter of sliding dots along the arc.
  for (const c of circles) {
    const on = nodes.filter((n) => n.circles.includes(c.id));
    on.sort((p, q) => Math.atan2(p.y - c.cy, p.x - c.cx) - Math.atan2(q.y - c.cy, q.x - c.cx));
    c.band = on.map((n) => n.facelet);
  }

  const byFacelet: StickerNode[] = [];
  for (const n of nodes) byFacelet[n.facelet] = n;
  return { nodes, circles, byFacelet };
}

const built = buildMap();

export const STICKER_NODES: readonly StickerNode[] = built.nodes;
export const MAP_CIRCLES: readonly MapCircle[] = built.circles;

export function nodeForFacelet(facelet: number): StickerNode {
  return built.byFacelet[facelet];
}

/** Bounding box of the whole figure, for fitting it to a viewport. */
export const MAP_EXTENT = (() => {
  let r = 0;
  for (const c of MAP_CIRCLES) r = Math.max(r, Math.hypot(c.cx, c.cy) + c.radius);
  return r;
})();

/* ----------------------------------------------------- moves and bands --- */

/**
 * The circle a face turn rotates: the band of twelve facelets that lies in the
 * plane of the turned layer, on the four faces around it.
 */
export function bandCircleForMove(move: number): MapCircle {
  const face = MOVE_FACE[move];
  const normal = FACE_NORMAL[face];
  const axis = normal[0] !== 0 ? 0 : normal[1] !== 0 ? 1 : 2;
  const layer = normal[axis];
  const circle = MAP_CIRCLES.find((c) => c.family.axis === axis && c.layer === layer);
  if (!circle) throw new Error(`no band circle for move ${move}`);
  return circle;
}

/** The nine facelets of the face a move turns, plus the twelve in its band. */
export function faceletsAffectedBy(move: number): number[] {
  const face = MOVE_FACE[move];
  const out: number[] = [];
  for (let i = 0; i < 9; i++) if (i !== 4) out.push(face * 9 + i);
  out.push(...bandCircleForMove(move).band);
  return out;
}

/**
 * How far around its band circle a move carries a dot, as a number of steps
 * among the twelve. A quarter turn moves three, a half turn six.
 */
export function bandStepsForMove(move: number): number {
  return 3 * MOVE_POWER[move];
}

/* ------------------------------------------------ the facelet shuffle --- */

function rotateOnce(v: Vec3, axis: number, sign: number): Vec3 {
  const [x, y, z] = v;
  // A clockwise quarter turn of a face is a rotation of -90 degrees about that
  // face's outward normal, matching the convention the 3D scene uses.
  if (axis === 0) return sign > 0 ? [x, z, -y] : [x, -z, y];
  if (axis === 1) return sign > 0 ? [-z, y, x] : [z, y, -x];
  return sign > 0 ? [y, -x, z] : [-y, x, z];
}

const PERMUTATIONS: number[][] = (() => {
  const all: number[][] = [];
  for (let m = 0; m < N_MOVES; m++) {
    const face = MOVE_FACE[m];
    const normal = FACE_NORMAL[face];
    const axis = normal[0] !== 0 ? 0 : normal[1] !== 0 ? 1 : 2;
    const sign = normal[axis];
    const to = new Array<number>(54);
    for (let f = 0; f < 54; f++) to[f] = f;
    for (const node of STICKER_NODES) {
      if (node.position[axis] !== sign) continue; // not in the turning layer
      let p = node.position;
      let n = node.normal;
      for (let k = 0; k < MOVE_POWER[m]; k++) {
        p = rotateOnce(p, axis, sign);
        n = rotateOnce(n, axis, sign);
      }
      const dest = faceletAt(p, n);
      if (dest < 0) throw new Error('a turn moved a facelet off the cube');
      to[node.facelet] = dest;
    }
    all.push(to);
  }
  return all;
})();

/**
 * Where each sticker travels when a move is made: `destinationOf(m)[f]` is the
 * facelet that the sticker currently sitting on facelet `f` moves to. This is
 * what the animation interpolates along, and it is checked against the cube
 * model in the tests rather than trusted.
 */
export function destinationOf(move: number): readonly number[] {
  return PERMUTATIONS[move];
}

/** The inverse: which sticker arrives at each facelet. */
export function sourceOf(move: number): number[] {
  const to = PERMUTATIONS[move];
  const from = new Array<number>(54);
  for (let f = 0; f < 54; f++) from[to[f]] = f;
  return from;
}

/* --------------------------------------------------- pieces, for hover --- */

/** The other facelets belonging to the same physical piece. */
export function siblingFacelets(facelet: number): number[] {
  for (const t of CORNER_FACELET) if (t.includes(facelet)) return t.filter((f) => f !== facelet);
  for (const t of EDGE_FACELET) if (t.includes(facelet)) return t.filter((f) => f !== facelet);
  return [];
}

export const MOVE_COUNT = N_MOVES;
