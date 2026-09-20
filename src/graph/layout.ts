/**
 * Radial layout for a slice of the state graph.
 *
 * The reference animation draws the cube's state space as dots threaded on
 * concentric arcs, and that picture is not decoration: the rings are distance
 * from the position you started at. Laying the breadth-first tree out radially
 * reproduces it exactly, and the edges that are *not* tree edges - the ones
 * that arc across between rings - are the visual evidence that this is a graph
 * with cycles rather than a tree, which is the whole reason shortest paths are
 * interesting here.
 */

import { MOVE_FACE } from '../cube/defs';
import type { GraphPayload } from '../solver/protocol';

export interface LaidOutNode {
  id: number;
  depth: number;
  angle: number;
  radius: number;
  x: number;
  y: number;
  facelets: string;
  viaMove: number;
  parent: number;
  face: number;
}

export interface LaidOutEdge {
  a: number;
  b: number;
  move: number;
  tree: boolean;
}

export interface Layout {
  nodes: LaidOutNode[];
  edges: LaidOutEdge[];
  rings: number[];
  maxRadius: number;
  truncated: boolean;
  /** How many nodes sit on each ring, so the drawing can size the dots. */
  ringCounts: number[];
}

export function radialLayout(graph: GraphPayload, ringGap = 100): Layout {
  const n = graph.nodes.length;
  const children: number[][] = Array.from({ length: n }, () => []);
  let maxDepth = 0;
  for (const node of graph.nodes) {
    if (node.parent >= 0) children[node.parent].push(node.id);
    if (node.depth > maxDepth) maxDepth = node.depth;
  }

  // Angular extent of each subtree is proportional to how many leaves it has.
  const leaves = new Int32Array(n);
  const order: number[] = [];
  const visit = (id: number): number => {
    order.push(id);
    if (children[id].length === 0) { leaves[id] = 1; return 1; }
    let total = 0;
    for (const c of children[id]) total += visit(c);
    leaves[id] = total;
    return total;
  };
  const roots = graph.nodes.filter((nd) => nd.parent < 0).map((nd) => nd.id);
  let totalLeaves = 0;
  for (const r of roots) totalLeaves += visit(r);
  if (totalLeaves === 0) totalLeaves = 1;

  const angle = new Float64Array(n);
  const span = new Float64Array(n);
  let cursor = -Math.PI / 2;
  const assign = (id: number, start: number, width: number): void => {
    span[id] = width;
    angle[id] = start + width / 2;
    let at = start;
    for (const c of children[id]) {
      const w = (leaves[c] / Math.max(1, leaves[id])) * width;
      assign(c, at, w);
      at += w;
    }
  };
  for (const r of roots) {
    const w = (leaves[r] / totalLeaves) * Math.PI * 2;
    assign(r, cursor, w);
    cursor += w;
  }

  // Linear spacing keeps each ring visibly separate. Square-root spacing packs
  // the outer rings so tightly that the tree edges merge into grey wedges.
  const radiusOf = (d: number): number => ringGap * d;

  const nodes: LaidOutNode[] = graph.nodes.map((nd) => {
    const r = radiusOf(nd.depth);
    const a = angle[nd.id];
    return {
      id: nd.id,
      depth: nd.depth,
      angle: a,
      radius: r,
      x: Math.cos(a) * r,
      y: Math.sin(a) * r,
      facelets: nd.facelets,
      viaMove: nd.viaMove,
      parent: nd.parent,
      face: nd.viaMove >= 0 ? MOVE_FACE[nd.viaMove] : -1,
    };
  });

  const seenEdge = new Set<string>();
  const edges: LaidOutEdge[] = [];
  for (const e of graph.edges) {
    const key = e.a < e.b ? `${e.a}:${e.b}` : `${e.b}:${e.a}`;
    if (seenEdge.has(key)) continue;
    seenEdge.add(key);
    const tree = graph.nodes[e.b]?.parent === e.a || graph.nodes[e.a]?.parent === e.b;
    edges.push({ a: e.a, b: e.b, move: e.move, tree });
  }

  const rings: number[] = [];
  for (let d = 1; d <= maxDepth; d++) rings.push(radiusOf(d));
  const ringCounts: number[] = new Array(maxDepth + 1).fill(0);
  for (const nd of nodes) ringCounts[nd.depth]++;

  return { nodes, edges, rings, maxRadius: radiusOf(maxDepth), truncated: graph.truncated, ringCounts };
}

/**
 * Lay out a set of distance shells where each ring stands for a whole sphere
 * of states, most of which are far too numerous to draw. Used for the 2x2x2
 * atlas and for the published 3x3x3 distribution.
 */
export interface ShellSpec {
  distance: number;
  count: number;
  exact: boolean;
  sample?: number;
}

export interface ShellLayout {
  shells: { distance: number; count: number; exact: boolean; radius: number; dots: { x: number; y: number }[] }[];
  maxRadius: number;
}

export function shellLayout(spec: ShellSpec[], maxRadius = 320, dotsPerShell = 90): ShellLayout {
  const maxDistance = spec.reduce((m, s) => Math.max(m, s.distance), 1);
  const shells = spec.map((s) => {
    const radius = (s.distance / maxDistance) * maxRadius;
    const want = s.sample ?? Math.min(dotsPerShell, Math.max(1, Math.round(Math.log10(Math.max(1, s.count)) * 12)));
    const dots: { x: number; y: number }[] = [];
    const jitter = seeded(s.distance * 7919 + 13);
    for (let i = 0; i < want; i++) {
      const a = (i / want) * Math.PI * 2 + jitter() * 0.28;
      const rr = radius + (jitter() - 0.5) * 7;
      dots.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr });
    }
    return { distance: s.distance, count: s.count, exact: s.exact, radius, dots };
  });
  return { shells, maxRadius };
}

function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
