/// <reference lib="webworker" />
/**
 * Every expensive thing the app does happens in here: building the lookup
 * tables, running both solvers, and walking the state graph. Keeping it off
 * the main thread is what lets the 3D cube stay at 60fps while a search with
 * tens of millions of nodes is running underneath it.
 */

import { CubieCube } from '../cube/cubie';
import { faceletString, fromFacelets, toFacelets } from '../cube/facelet';
import { N_MOVES } from '../cube/defs';
import { randomMoveScramble, randomState } from './scramble';
import { buildCoreTables, buildOptimalTables, tableDiameter, tableHistogram } from './tables';
import {
  buildPocketTables, N_POCKET, POCKET_MOVES, pocketApply, pocketRandomAtDistance,
  pocketStickers, solvePocket,
} from './pocket';
import { solveTwoPhase } from './twophase';
import { solveOptimal } from './optimal';
import { crossTableStats, flipTableStats, solveCross, solveEdgeOrientation, solveToG1 } from './stages';
import { explainSolution } from '../cube/analysis';
import type { GraphPayload, SolverRequest, SolverResponse } from './protocol';

const post = (msg: SolverResponse): void => { (self as unknown as Worker).postMessage(msg); };

function neighbourhood(cube: CubieCube, depth: number, maxNodes: number): GraphPayload {
  const nodes: GraphPayload['nodes'] = [];
  const edges: GraphPayload['edges'] = [];
  const index = new Map<string, number>();
  let truncated = false;

  const add = (c: CubieCube, d: number, parent: number, viaMove: number): number => {
    const key = c.key();
    const existing = index.get(key);
    if (existing !== undefined) return existing;
    if (nodes.length >= maxNodes) { truncated = true; return -1; }
    const id = nodes.length;
    index.set(key, id);
    nodes.push({ id, facelets: faceletString(toFacelets(c)), depth: d, parent, viaMove });
    return id;
  };

  const root = add(cube, 0, -1, -1);
  let frontier: { id: number; cube: CubieCube }[] = [{ id: root, cube }];
  for (let d = 1; d <= depth; d++) {
    const next: { id: number; cube: CubieCube }[] = [];
    for (const item of frontier) {
      for (let m = 0; m < N_MOVES; m++) {
        const child = item.cube.clone().applyMove(m);
        const before = index.size;
        const id = add(child, d, item.id, m);
        if (id < 0) { truncated = true; break; }
        edges.push({ a: item.id, b: id, move: m });
        if (index.size > before) next.push({ id, cube: child });
      }
      if (truncated) break;
    }
    frontier = next;
    if (truncated) break;
  }
  return { nodes, edges, truncated };
}

self.onmessage = (ev: MessageEvent<SolverRequest>): void => {
  const req = ev.data;
  try {
    switch (req.kind) {
      case 'prepare': {
        buildCoreTables((stage, fraction) => post({ id: req.id, kind: 'progress', stage, fraction }));
        post({ id: req.id, kind: 'ready' });
        break;
      }
      case 'prepare-optimal': {
        buildCoreTables();
        buildOptimalTables((stage, fraction) => post({ id: req.id, kind: 'progress', stage, fraction }));
        post({ id: req.id, kind: 'ready' });
        break;
      }
      case 'prepare-pocket': {
        buildPocketTables();
        post({ id: req.id, kind: 'ready' });
        break;
      }
      case 'solve': {
        buildCoreTables();
        const cube = fromFacelets(req.facelets);
        const solution = solveTwoPhase(cube, {
          maxLength: req.maxLength,
          timeBudgetMs: req.timeBudgetMs,
          goodEnough: req.goodEnough,
          onImprove: (s) => post({ id: req.id, kind: 'improved', solution: s }),
        });
        post({ id: req.id, kind: 'solution', solution });
        break;
      }
      case 'solve-optimal': {
        const cube = fromFacelets(req.facelets);
        const solution = solveOptimal(cube, {
          maxLength: req.maxLength,
          timeBudgetMs: req.timeBudgetMs,
          onTables: (stage, fraction) => post({ id: req.id, kind: 'progress', stage, fraction }),
          onDepth: (provenLowerBound, nodes) => post({ id: req.id, kind: 'depth', provenLowerBound, nodes }),
        });
        post({ id: req.id, kind: 'solution', solution });
        break;
      }
      case 'scramble': {
        let cube: CubieCube;
        let moves: number[] = [];
        if (req.uniform) {
          cube = randomState();
        } else {
          moves = randomMoveScramble(req.length ?? 25);
          cube = CubieCube.fromMoves(moves);
        }
        post({ id: req.id, kind: 'scramble', moves, facelets: faceletString(toFacelets(cube)) });
        break;
      }
      case 'neighbourhood': {
        const cube = fromFacelets(req.facelets);
        post({ id: req.id, kind: 'graph', graph: neighbourhood(cube, req.depth, req.maxNodes ?? 4000) });
        break;
      }
      case 'stats': {
        const core = buildCoreTables();
        const opt = (() => { try { return buildOptimalTables(); } catch { return null; } })();
        post({
          id: req.id, kind: 'stats',
          stats: {
            coreBytes: core.bytes,
            optimalBytes: opt?.bytes ?? 0,
            histograms: {
              'twist x slice': tableHistogram(core.pruneTwistSlice),
              'flip x slice': tableHistogram(core.pruneFlipSlice),
              'flip x twist': tableHistogram(core.pruneFlipTwist),
              'phase 2 corners': tableHistogram(core.pruneP2Corner),
              'phase 2 edges': tableHistogram(core.pruneP2Edge),
            },
            diameters: {
              'twist x slice': tableDiameter(core.pruneTwistSlice),
              'flip x slice': tableDiameter(core.pruneFlipSlice),
              'flip x twist': tableDiameter(core.pruneFlipTwist),
              'phase 2 corners': tableDiameter(core.pruneP2Corner),
              'phase 2 edges': tableDiameter(core.pruneP2Edge),
            },
          },
        });
        break;
      }
      case 'pocket-stats': {
        const T = buildPocketTables();
        post({
          id: req.id, kind: 'pocket-stats',
          stats: { states: N_POCKET, godsNumber: T.godsNumber, histogram: T.histogram, millis: T.millis },
        });
        break;
      }
      case 'pocket-solve': {
        const T = buildPocketTables();
        const moves = solvePocket(req.index, T);
        // Ship the whole animation with the answer so the page never has to
        // build the three-million-entry table on the UI thread.
        const frames: number[][] = [Array.from(pocketStickers(req.index))];
        let idx = req.index;
        for (const m of moves) {
          idx = pocketApply(idx, POCKET_MOVES.indexOf(m), T);
          frames.push(Array.from(pocketStickers(idx)));
        }
        post({ id: req.id, kind: 'pocket-solution', moves, distance: T.distance[req.index], frames });
        break;
      }
      case 'pocket-scramble': {
        const T = buildPocketTables();
        const index = pocketRandomAtDistance(req.distance, Math.random, T);
        post({
          id: req.id, kind: 'pocket-scramble', index, distance: T.distance[index],
          stickers: Array.from(pocketStickers(index)),
        });
        break;
      }
      case 'stage': {
        const cube = fromFacelets(req.facelets);
        const r = req.stage === 'cross' ? solveCross(cube)
          : req.stage === 'edge-orientation' ? solveEdgeOrientation(cube)
            : solveToG1(cube);
        post({ id: req.id, kind: 'stage', moves: r.moves, distance: r.distance, optimal: r.optimal, goal: r.goal });
        break;
      }
      case 'explain': {
        post({ id: req.id, kind: 'explain', narrative: explainSolution(fromFacelets(req.facelets), req.moves) });
        break;
      }
      case 'stage-stats': {
        post({ id: req.id, kind: 'stage-stats', stats: { cross: crossTableStats(), flip: flipTableStats() } });
        break;
      }
      default: {
        post({ id: (req as { id: number }).id, kind: 'error', message: 'Unknown request.' });
      }
    }
  } catch (err) {
    post({ id: req.id, kind: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
